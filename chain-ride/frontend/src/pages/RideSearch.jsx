import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pageVariants, pageTransition } from '../components/Animations';
import { FiChevronLeft, FiMapPin, FiCompass, FiClock, FiAlertCircle, FiSmartphone, FiDollarSign } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useJsApiLoader, GoogleMap, Marker, Autocomplete, DirectionsRenderer } from '@react-google-maps/api';
import { apiPost, apiGet } from '../utils/api';
import { darkMapTheme } from '../utils/mapTheme';

const center = { lat: 28.6139, lng: 77.2090 };
const libraries = ['places'];

const STATUS_COLORS = {
  Searching:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  Matched:    'bg-blue-100 text-blue-700 border-blue-200',
  'On Ride':  'bg-green-100 text-green-700 border-green-200',
  Completed:  'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled:  'bg-red-100 text-red-700 border-red-200',
};

const VEHICLE_OPTIONS = [
  { type: 'bike',  label: 'Bike',   emoji: '🏍️', description: 'Fast & affordable' },
  { type: 'auto',  label: 'Auto',   emoji: '🛺', description: 'Affordable rickshaw' },
  { type: 'mini',  label: 'Mini',   emoji: '🚗', description: 'Compact for 3' },
  { type: 'sedan', label: 'Sedan',  emoji: '🚘', description: 'Comfortable for 4' },
  { type: 'suv',   label: 'SUV',    emoji: '🚙', description: 'Spacious for 6' },
];

function RideSearch() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('book');
  const [isSearching, setIsSearching] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [distanceVal, setDistanceVal] = useState(0);
  const [durationVal, setDurationVal] = useState(0);
  const [myRides, setMyRides] = useState([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [startLocObj, setStartLocObj] = useState(null);
  const [endLocObj, setEndLocObj] = useState(null);
  const [pickupPos, setPickupPos] = useState(center);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [vehicleType, setVehicleType] = useState('mini');
  const [passengerCount, setPassengerCount] = useState(1);
  const [fareBreakdown, setFareBreakdown] = useState(null);
  const [loadingFare, setLoadingFare] = useState(false);
  const [allFarePreviews, setAllFarePreviews] = useState(null);
  const [fareToken, setFareToken] = useState(null); // HMAC-signed token from server

  const originRef = useRef();
  const destinationRef = useRef();
  const originAutocompleteRef = useRef(null);
  const fareDebounceRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  useEffect(() => {
    if (isLoaded && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setPickupPos(pos);
          reverseGeocode(pos.lat, pos.lng, originRef);
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }
  }, [isLoaded]);

  // ── Real-time surge updates via socket ─────────────────────────────────────
  useEffect(() => {
    const socket = window.socket;
    if (!socket || !startLocObj || !endLocObj) return;

    const handleSurgeUpdate = ({ surge }) => {
      if (!startLocObj || !endLocObj) return;
      if (fareDebounceRef.current) clearTimeout(fareDebounceRef.current);
      fareDebounceRef.current = setTimeout(() => {
        fetchFareEstimate(startLocObj, endLocObj);
      }, 500);
    };

    socket.on('surgeUpdate', handleSurgeUpdate);
    return () => { socket.off('surgeUpdate', handleSurgeUpdate); };
  }, [startLocObj, endLocObj]);

  const reverseGeocode = (lat, lng, ref) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) {
        if (ref && ref.current) {
          ref.current.value = results[0].formatted_address;
        }
      }
    });
  };

  const onMapClick = (e) => {
    if (directionsResponse) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPickupPos({ lat, lng });
    reverseGeocode(lat, lng, originRef);
  };

  const onOriginLoad = (autocomplete) => {
    originAutocompleteRef.current = autocomplete;
  };

  const onOriginPlaceChanged = () => {
    if (originAutocompleteRef.current) {
      const place = originAutocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        setPickupPos({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
      }
    }
  };

  const calculateRoute = async (e) => {
    e.preventDefault();
    setError('');
    setFareBreakdown(null); // clear stale estimate
    if (!originRef.current.value || !destinationRef.current.value) return;
    if (!window.google?.maps?.DirectionsService) {
      setError('Maps not fully loaded. Please try again.');
      return;
    }
    setIsSearching(true);
    const directionsService = new window.google.maps.DirectionsService();
    try {
      const results = await directionsService.route({
        origin: originRef.current.value,
        destination: destinationRef.current.value,
        travelMode: window.google.maps.TravelMode.DRIVING,
      });
      if (!results?.routes?.[0]?.legs?.[0]) {
        setError('Could not find a route between these locations.');
        return;
      }
      setDirectionsResponse(results);
      const leg = results.routes[0].legs[0];
      setDistance(leg.distance.text);
      setDuration(leg.duration.text);
      setDistanceVal(parseFloat((leg.distance.value / 1000).toFixed(2)));
      setDurationVal(parseFloat((leg.duration.value / 60).toFixed(0)));
      const start = { address: leg.start_address, lat: leg.start_location.lat(), lng: leg.start_location.lng() };
      const end   = { address: leg.end_address,   lat: leg.end_location.lat(),   lng: leg.end_location.lng() };
      setStartLocObj(start);
      setEndLocObj(end);

      // Debounce fare estimate call
      if (fareDebounceRef.current) clearTimeout(fareDebounceRef.current);
      fareDebounceRef.current = setTimeout(() => {
        fetchFareEstimate(start, end);
        fetchAllFarePreviews(start, end);
      }, 600);
    } catch (err) {
      setError('Could not calculate route. Please check the locations.');
    } finally {
      setIsSearching(false);
    }
  };

  const fetchFareEstimate = async (startLoc, endLoc, vt) => {
    if (!startLoc?.lat || !endLoc?.lat) return;
    setLoadingFare(true);
    try {
      const data = await apiPost('/fare/calculate', {
        pickupLat: startLoc.lat,
        pickupLng: startLoc.lng,
        dropLat: endLoc.lat,
        dropLng: endLoc.lng,
        vehicleType: vt || vehicleType,
      });
      setFareBreakdown(data);
      // Store the signed fareToken for tamper-proof booking
      if (data.fareToken) setFareToken(data.fareToken);
    } catch {
      setFareBreakdown(null);
      setFareToken(null);
    } finally {
      setLoadingFare(false);
    }
  };

  // ── Re-calculate fare + previews when vehicle type changes on an existing route ──
  useEffect(() => {
    if (!startLocObj || !endLocObj) return;
    if (!directionsResponse) return; // only trigger after route is set
    fetchFareEstimate(startLocObj, endLocObj, vehicleType);
    fetchAllFarePreviews(startLocObj, endLocObj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, directionsResponse]); // vehicleType changes → re-fetch

  const fetchAllFarePreviews = async (startLoc, endLoc) => {
    try {
      const data = await apiGet(`/fare/preview?pickupLat=${startLoc.lat}&pickupLng=${startLoc.lng}&dropLat=${endLoc.lat}&dropLng=${endLoc.lng}`);
      setAllFarePreviews(data.previews || []);
    } catch {
      setAllFarePreviews(null);
    }
  };

  const clearRoute = () => {
    setDirectionsResponse(null);
    setDistance(''); setDuration(''); setError('');
    setFareBreakdown(null);
    setFareToken(null);
    setAllFarePreviews(null);
    originRef.current.value = ''; destinationRef.current.value = '';
    setStartLocObj(null); setEndLocObj(null);
    setPaymentMethod('UPI');
    setVehicleType('mini');
    setPassengerCount(1);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPickupPos(pos);
        reverseGeocode(pos.lat, pos.lng, originRef);
      });
    }
  };

  const requestRide = async () => {
    setError('');
    const userId = localStorage.getItem('userId');
    if (!userId) { navigate('/auth'); return; }
    if (!startLocObj || !endLocObj) { setError('Please calculate a route first.'); return; }
    setIsRequesting(true);
    try {
      const data = await apiPost('/rides/instant', {
        startLocation: startLocObj,
        endLocation: endLocObj,
        distance: distanceVal,
        duration: durationVal,
        paymentMethod,
        vehicleType,
        passengerCount,
        fareToken: fareToken || undefined, // include signed fare token for server verification
      });

      // Join passenger-specific socket room so they receive rideAccepted notification
      if (window.socket && userId) {
        window.socket.emit('joinRoom', `passenger_${userId}`);
      }

      navigate(`/live?rideId=${data.ride._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRequesting(false);
    }
  };

  const fetchMyRides = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) { navigate('/auth'); return; }
    setLoadingRides(true);
    try {
      const data = await apiGet('/rides/my-rides');
      setMyRides(data.rides || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRides(false);
    }
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'my-rides') fetchMyRides();
  };

  return (
    <motion.div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative"
      initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>

      {/* Search Panel */}
      <div className="w-full md:w-1/3 bg-white z-10 shadow-2xl flex flex-col h-[60vh] md:h-[100dvh] md:sticky md:top-0">
        <header className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
              <FiChevronLeft size={22} />
            </button>
            <h2 className="text-xl font-bold text-slate-800">ChainRide</h2>
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <button onClick={() => handleTabChange('book')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'book' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Book</button>
            <button onClick={() => handleTabChange('my-rides')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'my-rides' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>My Rides</button>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {tab === 'book' ? (
              <motion.div key="book" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                {!isLoaded ? (
                  <div className="text-slate-500 flex items-center gap-2 py-4">
                    <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />Loading maps...
                  </div>
                ) : (
                  <form onSubmit={calculateRoute} className="relative">
                    <div className="absolute left-[19px] top-8 bottom-14 w-[2px] bg-slate-200" />
                    <div className="flex items-center gap-3 mb-5 relative">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 z-10 shrink-0"><FiCompass size={18} /></div>
                      <div className="w-full">
                        <Autocomplete onLoad={onOriginLoad} onPlaceChanged={onOriginPlaceChanged}>
                          <input type="text" ref={originRef} placeholder="Pickup Location"
                            className="w-full bg-slate-100 px-4 py-3 rounded-xl border-2 border-transparent focus:bg-white focus:border-blue-500 outline-none transition-all text-sm" required />
                        </Autocomplete>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-6 relative">
                      <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 z-10 shrink-0"><FiMapPin size={18} /></div>
                      <div className="w-full">
                        <Autocomplete>
                          <input type="text" ref={destinationRef} placeholder="Destination"
                            className="w-full bg-slate-100 px-4 py-3 rounded-xl border-2 border-transparent focus:bg-white focus:border-blue-500 outline-none transition-all text-sm" required />
                        </Autocomplete>
                      </div>
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 rounded-xl p-3 border border-red-100">
                        <FiAlertCircle size={16} />{error}
                      </div>
                    )}
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-base shadow-md hover:bg-slate-800 transition-colors" type="submit" disabled={isSearching}>
                      {isSearching ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Calculating...</span> : 'Find Route'}
                    </motion.button>
                  </form>
                )}

                <AnimatePresence>
                  {distance && duration && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                      className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-slate-500 font-medium text-sm">Distance</span>
                        <span className="font-bold text-slate-800">{distance}</span>
                      </div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-slate-500 font-medium text-sm flex items-center gap-1"><FiClock size={13} /> Duration</span>
                        <span className="font-bold text-slate-800">{duration}</span>
                      </div>
                      {/* Vehicle type selector */}
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 font-medium mb-2">Select vehicle type</p>
                        <div className="grid grid-cols-5 gap-2">
                          {VEHICLE_OPTIONS.map(v => (
                            <button
                              key={v.type}
                              type="button"
                              onClick={() => {
                                setVehicleType(v.type);
                              }}
                              className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                                vehicleType === v.type
                                  ? 'border-blue-600 bg-blue-50'
                                  : 'border-slate-200 bg-white hover:border-blue-300'
                              }`}
                            >
                              <span className="text-lg">{v.emoji}</span>
                              <span className={`text-xs font-semibold ${vehicleType === v.type ? 'text-blue-700' : 'text-slate-600'}`}>{v.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Fare previews for all vehicle types */}
                      {allFarePreviews && allFarePreviews.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-slate-500 font-medium mb-2">Fare estimates</p>
                          <div className="grid grid-cols-5 gap-2">
                            {allFarePreviews.map(fp => {
                              const vOpt = VEHICLE_OPTIONS.find(v => v.type === fp.vehicleType);
                              return (
                                <div key={fp.vehicleType} className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border-2 transition-all ${
                                  vehicleType === fp.vehicleType ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                                }`}>
                                  <span className="text-lg">{vOpt?.emoji || '🚗'}</span>
                                  <span className={`text-xs font-semibold ${vehicleType === fp.vehicleType ? 'text-blue-700' : 'text-slate-600'}`}>{vOpt?.label}</span>
                                  <span className="font-bold text-sm text-slate-800">₹{fp.totalFare}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Fare Breakdown */}
                      {loadingFare ? (
                        <div className="flex items-center justify-center gap-2 py-3 text-slate-400 text-sm">
                          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                          Calculating fare...
                        </div>
                      ) : fareBreakdown ? (
                        <div className="rounded-xl bg-white border border-blue-100 p-3 space-y-1.5 mb-4">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Base fare</span><span>₹{fareBreakdown.baseFare}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Distance cost</span><span>₹{fareBreakdown.distanceCost}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Time cost</span><span>₹{fareBreakdown.timeCost}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Platform fee</span><span>₹{fareBreakdown.platformFee}</span>
                          </div>
                          {fareBreakdown.surgeMultiplier > 1 ? (
                            <div className="flex justify-between text-xs text-orange-600 font-semibold">
                              <span>⚡ Surge</span><span>×{fareBreakdown.surgeMultiplier}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between text-sm font-bold text-slate-800 pt-2 border-t border-slate-100 mt-1">
                            <span>Total</span><span className="text-blue-700">₹{fareBreakdown.totalFare}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center mb-5 pt-3 border-t border-blue-100">
                          <span className="text-slate-500 font-medium text-sm">Est. Fare</span>
                          <span className="font-bold text-lg text-blue-700">₹{Math.round(distanceVal * 12 + durationVal * 1.5)}</span>
                        </div>
                      )}

                      {/* Passenger count selector */}
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 font-medium mb-2">Number of passengers</p>
                        <div className="flex items-center gap-3 bg-white border border-blue-100 rounded-xl p-2">
                          <button
                            type="button"
                            onClick={() => setPassengerCount(p => Math.max(1, p - 1))}
                            disabled={passengerCount <= 1}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center disabled:opacity-40 transition-colors"
                          >
                            −
                          </button>
                          <div className="flex-1 text-center">
                            <span className="text-xl font-bold text-slate-800">{passengerCount}</span>
                            <span className="text-xs text-slate-400 ml-1">{passengerCount === 1 ? 'passenger' : 'passengers'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPassengerCount(p => Math.min(6, p + 1))}
                            disabled={passengerCount >= 6}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center disabled:opacity-40 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Payment method selector */}
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 font-medium mb-2">Choose payment method</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('UPI')}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                              paymentMethod === 'UPI'
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                            }`}
                          >
                            <FiSmartphone size={15} /> Online
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('Cash')}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                              paymentMethod === 'Cash'
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                            }`}
                          >
                            <FiDollarSign size={15} /> Cash
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5 text-center">
                          {paymentMethod === 'UPI'
                            ? 'Pay via UPI / QR code after ride'
                            : 'Pay cash directly to driver after ride'}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={clearRoute} className="flex-1 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition text-sm">Clear</button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={requestRide} disabled={isRequesting}
                          className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-md text-sm disabled:opacity-60">
                          {isRequesting ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Requesting...</span> : '🚗 Request Ride'}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div key="my-rides" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <h3 className="font-bold text-slate-800 text-lg mb-4">My Rides</h3>
                {loadingRides ? (
                  <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
                    <span className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /><span>Loading rides...</span>
                  </div>
                ) : myRides.length === 0 ? (
                  <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
                    <FiMapPin size={36} className="opacity-30" />
                    <p className="text-center text-sm">No rides yet.<br />Book your first ride above!</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {myRides.map(ride => (
                      <motion.div key={ride._id} whileHover={{ y: -2 }}
                        onClick={() => navigate(`/live?rideId=${ride._id}`)}
                        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-1">{new Date(ride.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            <div className="flex items-start gap-2"><FiCompass size={14} className="text-slate-400 mt-0.5 shrink-0" /><p className="text-sm text-slate-700 font-medium line-clamp-1">{ride.startLocation?.address || 'N/A'}</p></div>
                            <div className="flex items-start gap-2 mt-1"><FiMapPin size={14} className="text-blue-500 mt-0.5 shrink-0" /><p className="text-sm text-slate-700 font-medium line-clamp-1">{ride.endLocation?.address || 'N/A'}</p></div>
                          </div>
                          <span className={`ml-2 mt-1 shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border ${STATUS_COLORS[ride.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{ride.status}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                          <span className="text-xs text-slate-400">{ride.distance ? `${ride.distance} km` : '--'} • {ride.duration ? `${ride.duration} mins` : '--'}</span>
                          <span className="font-bold text-slate-800 text-sm">₹{ride.fare}</span>
                        </div>
                        {ride.driver && <p className="text-xs text-blue-600 font-medium mt-2">Driver: {ride.driver.name}</p>}
                        {ride.vehicleType && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {ride.vehicleType.toUpperCase()} {ride.vehicleMake} {ride.vehicleModel} {ride.vehiclePlate ? `• ${ride.vehiclePlate}` : ''}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Map */}
      <div className="w-full md:w-2/3 h-[40vh] md:h-screen bg-slate-200 relative overflow-hidden">
        {!isLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-8 h-8 border-4 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <GoogleMap 
              center={pickupPos || center} 
              zoom={15} 
              mapContainerStyle={{ width: '100%', height: '100%' }}
              options={{ styles: darkMapTheme, zoomControl: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
              onClick={onMapClick}
            >
              {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
              {!directionsResponse && (
                <Marker 
                  position={pickupPos || center} 
                  draggable={true} 
                  onDragEnd={onMapClick} 
                />
              )}
            </GoogleMap>
            
            {!directionsResponse && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg pointer-events-none flex items-center gap-2">
                <span>📍</span> Click or drag marker for pickup location
              </div>
            )}

            {!directionsResponse && (
               <button 
                  onClick={() => {
                      if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(position => {
                              const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                              setPickupPos(pos);
                              reverseGeocode(pos.lat, pos.lng, originRef);
                          });
                      }
                  }}
                  className="absolute bottom-6 right-6 p-3 bg-white rounded-full shadow-lg text-slate-700 hover:text-blue-600 transition z-10">
                  <FiCompass size={22} />
               </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

export default RideSearch;
