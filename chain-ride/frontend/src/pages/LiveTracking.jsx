import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pageVariants, pageTransition } from '../components/Animations';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import {
  FiPhone, FiMessageCircle, FiShield, FiArrowLeft,
  FiMapPin, FiCheck, FiAlertCircle, FiHome, FiX,
  FiNavigation, FiClock, FiSend, FiAlertTriangle
} from 'react-icons/fi';
import PaymentModal from '../components/PaymentModal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../utils/api';
import { darkMapTheme } from '../utils/mapTheme';

// ── Constants ────────────────────────────────────────────────────────────────
const CENTER = { lat: 28.6139, lng: 77.2090 };
const LIBS = ['places'];
const AUTO_CANCEL_MINUTES = 3;
const ARRIVAL_THRESHOLD_METERS = 50;
const LOCATION_SEND_INTERVAL_MS = 3000;
const ROUTE_RECALC_INTERVAL_MS = 15000;

const STATUS_STEPS = ['Searching', 'Matched', 'On Ride', 'Completed'];

const STATUS_META = {
  Searching: { label: 'Searching for driver...', color: 'bg-yellow-500', icon: '🔍' },
  Matched:   { label: 'Driver matched!',          color: 'bg-blue-500',   icon: '✅' },
  'On Ride': { label: 'Ride in progress',         color: 'bg-green-500',  icon: '🚗' },
  Completed: { label: 'Ride Completed',           color: 'bg-slate-600',  icon: '🏁' },
  Cancelled: { label: 'Ride Cancelled',           color: 'bg-red-500',    icon: '❌' },
};

function LiveTracking() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rideId     = searchParams.get('rideId');
  const driverMode = searchParams.get('driverMode') === 'true';

  const [ride,              setRide]              = useState(null);
  const [loading,          setLoading]           = useState(true);
  const [error,            setError]             = useState('');
  const [driverLocation,    setDriverLocation]    = useState(null);
  const [directionsResponse,setDirectionsResponse]= useState(null);
  const [paymentOpen,       setPaymentOpen]       = useState(false);
  const [updatingStatus,    setUpdatingStatus]   = useState(false);
  const [showCompletion,    setShowCompletion]   = useState(false);
  const [countdown,         setCountdown]         = useState(AUTO_CANCEL_MINUTES * 60);
  const [isCancelling,      setIsCancelling]      = useState(false);

  // Chat & SOS State
  const [chatOpen,         setChatOpen]         = useState(false);
  const [messages,         setMessages]         = useState([]);
  const [chatInput,        setChatInput]        = useState('');
  const [sosActive,        setSosActive]        = useState(false);
  const chatEndRef        = useRef(null);

  // Navigation-specific state
  const [eta,              setEta]              = useState(null);
  const [distanceToPickup,  setDistanceToPickup] = useState(null);
  const [pickupCoords,     setPickupCoords]     = useState(null);
  const [arrived,          setArrived]           = useState(false);
  const [geoError,         setGeoError]          = useState('');

  const socketRef = useRef(null);
  const locationWatchRef = useRef(null);
  const routeRecalcRef = useRef(null);
  const mapRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBS,
  });

  const userId = localStorage.getItem('userId');

  // ── Socket setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rideId) return;

    const socket = window.socket;
    if (!socket) return;
    socketRef.current = socket;

    socket.emit('joinRideRoom', rideId);

    socket.on('locationUpdate', ({ lat, lng, eta: e, distance: d }) => {
      if (driverMode) return; // driver doesn't move passenger's marker
      setDriverLocation({ lat, lng });
      if (e != null) setEta(e);
      if (d != null) setDistanceToPickup(d);
    });

    socket.on('pickupInfo', ({ pickupLat, pickupLng, eta: e, distance: d }) => {
      setPickupCoords({ lat: pickupLat, lng: pickupLng });
      if (e != null) setEta(e);
      if (d != null) setDistanceToPickup(d);
    });

    socket.on('statusUpdated', ({ status }) => {
      setRide(prev => prev ? { ...prev, status } : prev);
    });

    socket.on('receiveMessage', (msgObj) => {
      setMessages((prev) => [...prev, msgObj]);
    });

    socket.on('sosAlert', () => {
      setSosActive(true);
    });

    return () => {
      socket.off('locationUpdate');
      socket.off('pickupInfo');
      socket.off('statusUpdated');
      socket.off('receiveMessage');
      socket.off('sosAlert');
    };
  }, [rideId, driverMode]);

  // Handle chat auto-scroll
  useEffect(() => {
    if (chatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatOpen]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('chatMessage', { rideId, message: chatInput.trim() });
    setChatInput('');
  };

  const triggerSOS = async () => {
    if (!rideId) return;
    try {
      await apiPost(`/rides/${rideId}/sos`, {});
      alert("SOS Triggered! Authorities and emergency contacts have been notified.");
    } catch (err) {
      setError('SOS Error: ' + err.message);
    }
  };

  // ── Fetch ride ──────────────────────────────────────────────────────────────
  const fetchRide = async () => {
    if (!rideId) { setLoading(false); return; }
    try {
      const data = await apiGet(`/rides/${rideId}`);
      setRide(data.ride);
      if (data.ride.status === 'Completed') {
        setShowCompletion(true);
        setPaymentOpen(true);
      }
      if (data.ride.status === 'Cancelled') {
        navigate('/dashboard');
      }
      // Set pickup coords for navigation
      if (data.ride.startLocation?.lat && !pickupCoords) {
        setPickupCoords({
          lat: data.ride.startLocation.lat,
          lng: data.ride.startLocation.lng,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel ride (user) ─────────────────────────────────────────────────────
  const cancelRide = async () => {
    if (!rideId || !userId) return;
    setIsCancelling(true);
    try {
      await apiPatch(`/rides/${rideId}/status`, { status: 'Cancelled' });
      navigate('/ride');
    } catch (err) {
      setError(err.message);
      setIsCancelling(false);
    }
  };

  // ── Update ride status (driver) ─────────────────────────────────────────────
  const updateStatus = async (newStatus) => {
    if (!rideId || !userId) return;
    setUpdatingStatus(true);
    try {
      const data = await apiPatch(`/rides/${rideId}/status`, { status: newStatus });
      setRide(data.ride);
      if (newStatus === 'Completed') setPaymentOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Draw route driver → pickup ───────────────────────────────────────────────
  const calcDriverRoute = useCallback((pickup) => {
    if (!isLoaded || !driverLocation || !pickup) return;
    if (!window.google?.maps?.DirectionsService) return;
    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin: { lat: driverLocation.lat, lng: driverLocation.lng },
      destination: { lat: pickup.lat, lng: pickup.lng },
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK' && result?.routes?.[0]?.legs?.[0]) {
        setDirectionsResponse(result);
        const leg = result.routes[0].legs[0];
        setEta(Math.ceil(leg.duration.value / 60));
        setDistanceToPickup(parseFloat((leg.distance.value / 1000).toFixed(1)));
      }
    });
  }, [isLoaded, driverLocation]);

  // ── Recalculate route periodically ─────────────────────────────────────────
  useEffect(() => {
    if (!driverMode || !pickupCoords || !driverLocation) return;
    const targetCoords = ride?.status === 'On Ride' && ride?.endLocation 
      ? { lat: ride.endLocation.lat, lng: ride.endLocation.lng } 
      : pickupCoords;

    calcDriverRoute(targetCoords);

    routeRecalcRef.current = setInterval(() => {
      calcDriverRoute(targetCoords);
    }, ROUTE_RECALC_INTERVAL_MS);

    return () => clearInterval(routeRecalcRef.current);
  }, [driverMode, pickupCoords, driverLocation, calcDriverRoute, ride?.status, ride?.endLocation]);

  // ── Driver location tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (!driverMode || !rideId || !navigator.geolocation) return;

    setGeoError('');
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setDriverLocation({ lat, lng });

        // Send to server every LOCATION_SEND_INTERVAL_MS
        if (socketRef.current) {
          socketRef.current.emit('driverLocationUpdate', { rideId, lat, lng });
        }

        // Fit map to show driver + pickup
        if (mapRef.current && pickupCoords) {
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend({ lat, lng });
          bounds.extend(pickupCoords);
          mapRef.current.fitBounds(bounds, 50);
        }

        // Arrival detection
        if (pickupCoords) {
          const dist = getHaversineDistance(lat, lng, pickupCoords.lat, pickupCoords.lng);
          if (dist <= ARRIVAL_THRESHOLD_METERS / 1000 && !arrived) {
            setArrived(true);
          }
        }
      },
      (err) => {
        setGeoError('Location access denied. Please enable GPS.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
  }, [driverMode, rideId, pickupCoords]);

  // ── Haversine distance (km) ──────────────────────────────────────────────────
  function getHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Draw route when ride data is ready (passenger view) ───────────────────────
  useEffect(() => {
    if (!ride || !isLoaded || driverMode) return;
    if (!window.google?.maps?.DirectionsService) return;
    const svc = new window.google.maps.DirectionsService();

    // 1. If Matched and we have driver location, show driver -> pickup
    if (ride.status === 'Matched' && driverLocation && ride.startLocation?.lat) {
      svc.route({
        origin: { lat: driverLocation.lat, lng: driverLocation.lng },
        destination: { lat: ride.startLocation.lat, lng: ride.startLocation.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK') setDirectionsResponse(result);
      });
    } 
    // 2. If On Ride, show pickup -> dropoff
    else if (ride.status === 'On Ride' && ride.startLocation?.lat && ride.endLocation?.lat) {
      svc.route({
        origin: { lat: ride.startLocation.lat, lng: ride.startLocation.lng },
        destination: { lat: ride.endLocation.lat, lng: ride.endLocation.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK') setDirectionsResponse(result);
      });
    }
  }, [ride?.status, isLoaded, driverMode, driverLocation]);

  // ── Poll every 8s ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchRide();
    const poll = setInterval(fetchRide, 8000);
    return () => clearInterval(poll);
  }, [rideId]);

  // ── Auto-cancel countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ride || ride.status !== 'Searching') {
      setCountdown(AUTO_CANCEL_MINUTES * 60);
      return;
    }
    let mounted = true;
    const timer = setInterval(() => {
      if (!mounted) return;
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          apiPatch(`/rides/${rideId}/status`, { status: 'Cancelled' }).then(() => {
            if (mounted) navigate('/ride');
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [ride?.status, rideId]);

  // ── Driver marker position interpolation ────────────────────────────────────
  // ── Driver marker position interpolation ────────────────────────────────────
  // Note: Marker position updates automatically via the `position` prop.
  // The ref-based setPosition approach is not needed with @react-google-maps/api.

  // ── Safe derived state ─────────────────────────────────────────────────────
  const rideStatus = ride?.status;
  const statusMeta = STATUS_META[rideStatus] || STATUS_META.Searching;
  const currentStepIdx = STATUS_STEPS.indexOf(rideStatus);
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  // ── Loading / Error / No ride screens ───────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <span className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-slate-400">Loading ride...</p>
      </div>
    </div>
  );

  if (!rideId) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 text-lg font-semibold mb-4">No ride ID provided</p>
        <button onClick={() => navigate('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 text-lg font-semibold mb-4">{error}</p>
        <button onClick={() => { setError(''); fetchRide(); }}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition mr-3">
          Try Again
        </button>
        <button onClick={() => navigate('/dashboard')}
          className="px-6 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition">
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  // Build map center safely
  const mapCenter = (() => {
    if (driverLocation) return { lat: driverLocation.lat, lng: driverLocation.lng };
    if (pickupCoords) return { lat: pickupCoords.lat, lng: pickupCoords.lng };
    if (ride?.startLocation?.lat && ride?.startLocation?.lng) {
      return { lat: ride.startLocation.lat, lng: ride.startLocation.lng };
    }
    return CENTER;
  })();

  return (
    <motion.div
      className="min-h-screen relative flex flex-col md:flex-row bg-slate-900"
      initial="initial" animate="in" exit="out"
      variants={pageVariants} transition={pageTransition}
    >
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
          if (driverMode) {
            navigate('/dashboard');
          } else {
            navigate('/ride');
          }
        }}
        fare={ride ? (ride.fare || 0) : 0}
        driverUpi={ride?.driver?.upiId || 'driver@okicici'}
        showCompletion={showCompletion}
        driverMode={driverMode}
        rideId={rideId}
        driverName={ride?.driver?.name || 'Driver'}
      />

      {/* ── Map ── */}
      <div className="w-full h-[55vh] md:w-2/3 md:h-screen relative">
        {!isLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
            <span className="w-8 h-8 border-4 border-slate-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <GoogleMap
            ref={mapRef}
            center={mapCenter}
            zoom={14}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            options={{ styles: darkMapTheme, disableDefaultUI: true }}
          >
            {directionsResponse && (
              <DirectionsRenderer
                directions={directionsResponse}
                options={{
                  polylineOptions: {
                    strokeColor: driverMode ? '#3b82f6' : '#22c55e',
                    strokeWeight: 5,
                  },
                }}
              />
            )}

            {/* Passenger pickup marker (Show for both driver and passenger) */}
            {ride?.startLocation?.lat && (
              <Marker
                position={{ lat: ride.startLocation.lat, lng: ride.startLocation.lng }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50"><circle cx="20" cy="20" r="18" fill="#ef4444" stroke="white" stroke-width="3"/><path d="M20 50 L20 28" stroke="#ef4444" stroke-width="4"/></svg>'
                  ),
                  anchor: new window.google.maps.Point(20, 50),
                  scaledSize: new window.google.maps.Size(40, 50),
                }}
              />
            )}

            {/* Passenger destination marker */}
            {ride?.endLocation?.lat && (
              <Marker
                position={{ lat: ride.endLocation.lat, lng: ride.endLocation.lng }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50"><circle cx="20" cy="20" r="18" fill="#3b82f6" stroke="white" stroke-width="3"/><path d="M20 50 L20 28" stroke="#3b82f6" stroke-width="4"/></svg>'
                  ),
                  anchor: new window.google.maps.Point(20, 50),
                  scaledSize: new window.google.maps.Size(40, 50),
                }}
              />
            )}

            {/* Driver marker (moving) - show for both driver and passenger view when available */}
            {driverLocation && (
              <Marker
                position={driverLocation}
                icon={{
                  url: 'https://maps.google.com/mapfiles/ms/icons/cabs.png',
                  scaledSize: new window.google.maps.Size(40, 40),
                }}
              />
            )}
          </GoogleMap>
        )}

        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="absolute top-4 left-4 bg-white/90 backdrop-blur p-2.5 rounded-full shadow-lg hover:bg-white transition z-10"
        >
          <FiArrowLeft size={20} className="text-slate-800" />
        </button>

        {/* Chat & SOS Floating Actions */}
        <div className="absolute top-4 right-4 flex flex-col gap-3 z-30">
          {(ride?.status === 'Matched' || ride?.status === 'On Ride') && (
            <>
              <button
                onClick={() => setChatOpen(true)}
                className="bg-blue-600/90 backdrop-blur text-white p-3 rounded-full shadow-lg hover:bg-blue-500 transition relative"
                title="Live Chat"
              >
                <FiMessageCircle size={22} />
                {chatOpen === false && messages.length > 0 && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900"></span>
                )}
              </button>
              
              <button
                onClick={triggerSOS}
                className="bg-red-600/90 backdrop-blur text-white p-3 rounded-full shadow-lg hover:bg-red-500 transition animate-pulse"
                title="Emergency SOS"
              >
                <FiAlertTriangle size={22} />
              </button>
            </>
          )}
        </div>

        {/* SOS Active Overlay */}
        {sosActive && (
          <div className="absolute inset-0 bg-red-600/20 pointer-events-none z-20 flex flex-col items-center justify-center">
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }} className="bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-2xl border-4 border-white/50 text-xl flex items-center gap-3">
              <FiAlertTriangle size={28} /> EMERGENCY SOS TRIGGERED
            </motion.div>
          </div>
        )}

        {/* GPS error */}
        {geoError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-4 py-2 rounded-xl z-10">
            <FiAlertCircle size={12} className="inline mr-1" />{geoError}
          </div>
        )}
      </div>

      {/* ── Side Panel ── */}
      <div className="w-full md:w-1/3 bg-slate-900 text-white flex flex-col p-6 gap-5 overflow-y-auto md:h-screen">

        {/* Status Badge */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${statusMeta.color}`}>
          <span className="text-2xl">{statusMeta.icon}</span>
          <div>
            <p className="font-bold text-white">{statusMeta.label}</p>
            <p className="text-white/70 text-xs">Ride ID: {rideId?.slice(-8)}</p>
          </div>
        </div>

        {/* Driver Navigation Panel */}
        {driverMode && ride?.status === 'Matched' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-900/50 border border-blue-500/30 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <FiNavigation size={16} className="text-blue-400" />
              <span className="text-blue-300 font-semibold text-sm">Navigating to Pickup</span>
            </div>

            {eta != null && distanceToPickup != null ? (
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <FiClock size={14} className="text-blue-400" />
                  <div>
                    <p className="text-xs text-slate-400">ETA</p>
                    <p className="font-bold text-white">{eta} min</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FiMapPin size={14} className="text-red-400" />
                  <div>
                    <p className="text-xs text-slate-400">Distance</p>
                    <p className="font-bold text-white">{distanceToPickup} km</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Calculating route...</p>
            )}

            {arrived && (
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="mt-2 p-3 bg-green-500/20 border border-green-500/40 rounded-xl text-green-300 text-sm text-center font-semibold"
              >
                ✅ Passenger pickup reached — You can start the ride!
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Progress Steps */}
        <div className="flex items-center justify-between bg-slate-800 rounded-2xl p-4">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${i <= currentStepIdx ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {i < currentStepIdx ? <FiCheck size={14} /> : i + 1}
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`h-0.5 w-5 mx-1 transition-all ${i < currentStepIdx ? 'bg-blue-500' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Passenger ETA Panel */}
        {!driverMode && ride?.status === 'Matched' && eta != null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-900/50 border border-blue-500/30 rounded-2xl p-4 flex gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                <FiClock size={18} />
              </div>
              <div>
                <p className="text-xs text-blue-300 font-medium">Driver arriving in</p>
                <div className="flex items-baseline gap-2">
                  <p className="font-bold text-white text-xl">{eta} min</p>
                  <p className="text-xs text-slate-400">{distanceToPickup} km away</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Route Info */}
        {ride && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <FiMapPin className="text-green-400 mt-0.5 shrink-0" size={16} />
              <div>
                <p className="text-xs text-slate-400">Pickup</p>
                <p className="text-sm font-medium text-white">{ride.startLocation?.address || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FiMapPin className="text-red-400 mt-0.5 shrink-0" size={16} />
              <div>
                <p className="text-xs text-slate-400">Drop</p>
                <p className="text-sm font-medium text-white">{ride.endLocation?.address || 'N/A'}</p>
              </div>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-700">
              <span className="text-slate-400 text-sm">{ride.distance ? `${ride.distance} km` : '--'} • {ride.duration ? `${ride.duration} min` : '--'}</span>
              <span className="font-bold text-white">₹{ride.fare || 0}</span>
            </div>
          </div>
        )}

        {/* Driver Info (passenger view) */}
        {ride?.driver && !driverMode && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-xl font-bold">
                  {(ride.driver.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white">{ride.driver.name}</p>
                  <p className="text-yellow-400 text-xs">⭐ {ride.driver.rating?.toFixed(1)}</p>
                  {ride.vehicleType && (
                    <p className="text-slate-400 text-xs mt-0.5">
                      {ride.vehicleType.toUpperCase()} {ride.vehicleMake} {ride.vehicleModel} {ride.vehiclePlate ? `• ${ride.vehiclePlate}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setChatOpen(true)} className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center transition" title="Chat">
                <FiMessageCircle size={16} className="text-white" />
              </button>
            </div>

            {/* Phone number — only shown once ride is confirmed */}
            {(ride.status === 'Matched' || ride.status === 'On Ride') && ride.driver?.phone && (
              <a
                href={`tel:${ride.driver.phone}`}
                className="flex items-center gap-3 bg-green-600/20 border border-green-500/30 rounded-xl px-4 py-2.5 hover:bg-green-600/30 transition group"
              >
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0 group-hover:bg-green-400 transition">
                  <FiPhone size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-green-400 font-medium">Call Driver</p>
                  <p className="text-white font-semibold text-sm">{ride.driver.phone}</p>
                </div>
              </a>
            )}
          </div>
        )}

        {/* Cancel countdown (passenger) */}
        {!driverMode && ride?.status === 'Searching' && (
          <div className="bg-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiAlertCircle size={16} className="text-yellow-400" />
              <span className="text-slate-400 text-sm">Auto-cancels in</span>
            </div>
            <span className="text-yellow-400 font-bold">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
          </div>
        )}

        {/* Passenger Cancel Button */}
        {!driverMode && (ride?.status === 'Searching' || ride?.status === 'Matched') && (
          <div className="mt-auto">
            <button
              onClick={cancelRide}
              disabled={isCancelling}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <FiX size={16} />
              {isCancelling ? 'Cancelling...' : 'Cancel Ride'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            <FiAlertCircle size={16} /> {error}
          </div>
        )}

        {/* Passenger Info (driver view) */}
        {driverMode && ride?.passenger && (ride.status === 'Matched' || ride.status === 'On Ride') && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-xl font-bold">
                {(ride.passenger.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white">{ride.passenger.name || 'Passenger'}</p>
                <p className="text-yellow-400 text-xs">⭐ {ride.passenger.rating?.toFixed(1) || '5.0'}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {ride.passengerCount || 1} passenger{(ride.passengerCount || 1) > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Passenger phone */}
            {ride.passenger?.phone && (
              <a
                href={`tel:${ride.passenger.phone}`}
                className="flex items-center gap-3 bg-purple-600/20 border border-purple-500/30 rounded-xl px-4 py-2.5 hover:bg-purple-600/30 transition group"
              >
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shrink-0 group-hover:bg-purple-400 transition">
                  <FiPhone size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-purple-400 font-medium">Call Passenger</p>
                  <p className="text-white font-semibold text-sm">{ride.passenger.phone}</p>
                </div>
              </a>
            )}
          </div>
        )}

        {/* Driver Controls */}
        {driverMode && ride && (
          <div className="flex flex-col gap-3 mt-auto">
            {ride.status === 'Matched' && (
              <button
                onClick={() => updateStatus('On Ride')}
                disabled={updatingStatus || (!arrived && !driverLocation)}
                className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition disabled:opacity-60"
              >
                {updatingStatus ? 'Updating...' : arrived ? '🚗 Start Ride' : '🚗 Head to Pickup'}
              </button>
            )}
            {ride.status === 'On Ride' && (
              <button onClick={() => updateStatus('Completed')} disabled={updatingStatus}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition disabled:opacity-60">
                {updatingStatus ? 'Updating...' : '🏁 Complete Ride'}
              </button>
            )}
            {ride.status === 'Searching' && (
              <button onClick={() => updateStatus('Cancelled')} disabled={updatingStatus}
                className="w-full py-3 bg-slate-700 hover:bg-red-900 text-slate-300 rounded-xl font-semibold transition disabled:opacity-60">
                Cancel Ride
              </button>
            )}
          </div>
        )}

        {/* Safety */}
        <div className="flex items-center gap-2 text-slate-500 text-xs mt-auto">
          <FiShield size={13} /> Your ride is tracked for safety
        </div>
      </div>

      {/* ── Chat Drawer ── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="absolute top-0 right-0 w-full md:w-96 h-full bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col"
          >
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
              <h3 className="text-white font-bold flex items-center gap-2"><FiMessageCircle /> Live Chat</h3>
              <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-white bg-slate-700 p-1.5 rounded-full"><FiX size={18} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-slate-500 text-sm text-center mt-10">Say hi to your {driverMode ? 'passenger' : 'driver'}...</p>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex ${m.userId === userId ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.userId === userId ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-white rounded-bl-none'}`}>
                      {m.message}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2 items-center">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-slate-900 border border-slate-600 rounded-full px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
              />
              <button type="submit" disabled={!chatInput.trim()} className="w-10 h-10 shrink-0 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                <FiSend size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default LiveTracking;
