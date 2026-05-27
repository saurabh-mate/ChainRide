import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Autocomplete, DirectionsRenderer, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { QRCode } from 'react-qr-code';
import { FiAlertCircle, FiCalendar, FiCheck, FiChevronLeft, FiMapPin, FiRefreshCw, FiStar, FiUsers, FiX, FiXCircle } from 'react-icons/fi';
import { pageTransition, pageVariants } from '../components/Animations';
import { apiGet, apiPatch, apiPost } from '../utils/api';
import { getSocket, syncSocketRooms } from '../utils/socket';
import PaymentModal from '../components/PaymentModal';

const libraries = ['places'];
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

const rideStatusClass = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const bookingStatusClass = {
  booked: 'bg-blue-100 text-blue-700 border-blue-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const formatDeparture = (dateTime) =>
  new Date(dateTime).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const buildQuery = (filters) => {
  const params = new URLSearchParams();
  if (filters.route.trim()) params.set('route', filters.route.trim());
  if (filters.date) params.set('date', filters.date);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  const query = params.toString();
  return query ? `?${query}` : '';
};

const buildQrSource = (value) => {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${SERVER_ORIGIN}${value}`;
  return value;
};

const buildUpiIntent = (ride, totalPrice) => {
  const upiId = ride?.driver?.upiId;
  if (!upiId) return '';
  const driverName = encodeURIComponent(ride.driver?.name || 'Driver');
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${driverName}&am=${encodeURIComponent(totalPrice)}&cu=INR`;
};

function CarpoolRides() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'browse';
  const [filters, setFilters] = useState({ route: '', date: '', maxPrice: '' });
  const [rides, setRides] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [routeDirections, setRouteDirections] = useState(null);
  const [pickupAutocomplete, setPickupAutocomplete] = useState(null);
  const [pickupPoint, setPickupPoint] = useState(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [seatsWanted, setSeatsWanted] = useState(1);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [cancellingRideId, setCancellingRideId] = useState('');
  const [feedbackRide, setFeedbackRide] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const totalPrice = useMemo(
    () => (selectedRide ? Number(selectedRide.pricePerSeat || 0) * Number(seatsWanted || 1) : 0),
    [selectedRide, seatsWanted]
  );

  const fetchAvailableRides = async (nextFilters = filters) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/offered-rides/available${buildQuery(nextFilters)}`);
      setRides(data.rides || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyBookings = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/offered-rides/my-bookings');
      setMyBookings(data.rides || []);
      const unrated = (data.rides || []).find(r => r.myBooking?.status === 'completed' && !r.myBooking?.ratedByPassenger);
      if (unrated && !feedbackRide) {
        setFeedbackRide(unrated);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'browse') fetchAvailableRides();
    else fetchMyBookings();
  }, [tab]);

  useEffect(() => {
    syncSocketRooms();
    const refresh = () => (tab === 'browse' ? fetchAvailableRides() : fetchMyBookings());
    getSocket().on('carpool:ride-updated', refresh);
    getSocket().on('carpool:booking-created', refresh);
    getSocket().on('carpool:booking-cancelled', refresh);
    return () => {
      getSocket().off('carpool:ride-updated', refresh);
      getSocket().off('carpool:booking-created', refresh);
      getSocket().off('carpool:booking-cancelled', refresh);
    };
  }, [tab, filters]);

  useEffect(() => {
    if (!selectedRide || !isLoaded) {
      setRouteDirections(null);
      return;
    }
    if (!window.google?.maps?.DirectionsService) return;
    if (!selectedRide.fromLocation?.lat || !selectedRide.toLocation?.lat) return;
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: selectedRide.fromLocation.lat, lng: selectedRide.fromLocation.lng },
        destination: { lat: selectedRide.toLocation.lat, lng: selectedRide.toLocation.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') setRouteDirections(result);
      }
    );
  }, [selectedRide, isLoaded]);

  const openBookingModal = (ride) => {
    setSelectedRide(ride);
    setPickupPoint(null);
    setPickupAddress('');
    setPaymentMethod('cash');
    setSeatsWanted(1);
    setBookingError('');
    setNotice('');
  };

  const closeBookingModal = () => {
    setSelectedRide(null);
    setRouteDirections(null);
    setPickupPoint(null);
    setPickupAddress('');
    setBookingError('');
  };

  const handlePickupAutocomplete = () => {
    if (!pickupAutocomplete) return;
    const place = pickupAutocomplete.getPlace();
    if (!place?.geometry?.location) return;
    setPickupPoint({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
    setPickupAddress(place.formatted_address || '');
  };

  const handleMapClick = (event) => {
    if (!selectedRide) return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    setPickupPoint({ lat, lng });
    if (!window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.[0]) setPickupAddress(results[0].formatted_address);
    });
  };

  const submitBooking = async () => {
    if (!selectedRide || !pickupPoint) {
      setBookingError('Choose a pickup point on the route before booking.');
      return;
    }
    setBooking(true);
    setBookingError('');
    try {
      await apiPost('/offered-rides/book', {
        rideId: selectedRide._id,
        seatsBooked: Number(seatsWanted),
        pickupPoint: { address: pickupAddress || 'Custom pickup point', lat: pickupPoint.lat, lng: pickupPoint.lng },
        paymentMethod,
      });
      closeBookingModal();
      setNotice('Seat booked successfully. Your booking has been added under My Bookings.');
      await fetchAvailableRides();
      await fetchMyBookings();
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setBooking(false);
    }
  };

  const cancelBooking = async (rideId) => {
    setCancellingRideId(rideId);
    setError('');
    try {
      await apiPatch(`/offered-rides/${rideId}/booking/cancel`);
      setNotice('Booking cancelled and the seat has been released.');
      await fetchMyBookings();
      await fetchAvailableRides();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancellingRideId('');
    }
  };

  return (
    <motion.div className="min-h-screen bg-slate-50" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"><FiChevronLeft size={20} /></button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Carpool Rides</h1>
              <p className="text-sm text-slate-500">Browse fixed-price rides and book custom pickup seats.</p>
            </div>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            <button onClick={() => navigate('/carpool?tab=browse')} className={`rounded-lg px-4 py-2 font-semibold transition ${tab === 'browse' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Available Rides</button>
            <button onClick={() => navigate('/carpool?tab=my-bookings')} className={`rounded-lg px-4 py-2 font-semibold transition ${tab === 'my-bookings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>My Bookings</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 md:p-6">
        {notice && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><FiCheck size={16} />{notice}</div>}
        {error && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><FiAlertCircle size={16} />{error}</div>}

        {tab === 'browse' ? (
          <>
            <div className="mb-5 grid gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:grid-cols-[1.4fr,1fr,1fr,auto]">
              <input value={filters.route} onChange={(e) => setFilters((c) => ({ ...c, route: e.target.value }))} placeholder="Filter by route or city" className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white" />
              <input type="date" value={filters.date} onChange={(e) => setFilters((c) => ({ ...c, date: e.target.value }))} className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white" />
              <input type="number" min="1" value={filters.maxPrice} onChange={(e) => setFilters((c) => ({ ...c, maxPrice: e.target.value }))} placeholder="Max seat price" className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white" />
              <div className="flex gap-3">
                <button onClick={() => fetchAvailableRides()} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">Apply</button>
                <button onClick={() => { const reset = { route: '', date: '', maxPrice: '' }; setFilters(reset); fetchAvailableRides(reset); }} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Clear</button>
              </div>
            </div>

            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-900">Available rides</h2><p className="text-sm text-slate-500">Seat counts refresh live when riders book or cancel.</p></div>
              <button onClick={() => fetchAvailableRides()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"><span className="inline-flex items-center gap-2"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />Refresh</span></button>
            </div>

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-100 bg-white shadow-sm"><span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" /></div>
            ) : rides.length === 0 ? (
              <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm"><FiMapPin className="mx-auto mb-4 text-slate-300" size={36} /><p className="text-sm text-slate-500">No rides match your current filters.</p></div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {rides.map((ride) => (
                  <div key={ride._id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{ride.driver?.name?.charAt(0)?.toUpperCase() || '?'}</div><div><p className="font-semibold text-slate-900">{ride.driver?.name || 'Driver'}</p><p className="flex items-center gap-1 text-xs text-amber-500"><FiStar className="fill-current" size={12} />{Number(ride.driver?.rating || 5).toFixed(1)}</p></div></div>
                      <div className="text-right"><p className="text-xl font-bold text-slate-900">INR {ride.pricePerSeat}</p><p className="text-xs text-slate-400">per seat</p></div>
                    </div>
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-700">{ride.fromLocation?.address}</p><p className="mt-3 text-sm font-semibold text-slate-700">{ride.toLocation?.address}</p></div>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2"><FiCalendar size={14} />{formatDeparture(ride.departureDateTime)}</span>
                      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-700"><FiUsers size={14} />{ride.seatsAvailable} seat{ride.seatsAvailable !== 1 ? 's' : ''} left</span>
                    </div>
                    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => openBookingModal(ride)} disabled={ride.seatsAvailable <= 0} className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">{ride.seatsAvailable <= 0 ? 'Fully booked' : 'Book seat'}</motion.button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-900">My bookings</h2><p className="text-sm text-slate-500">Review seats, pickup point, and payment method.</p></div>
              <button onClick={fetchMyBookings} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"><span className="inline-flex items-center gap-2"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />Refresh</span></button>
            </div>

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-100 bg-white shadow-sm"><span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" /></div>
            ) : myBookings.length === 0 ? (
              <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm"><FiMapPin className="mx-auto mb-4 text-slate-300" size={36} /><p className="text-sm text-slate-500">You have not booked a carpool ride yet.</p></div>
            ) : (
              <div className="grid gap-5">
                {myBookings.map((ride) => {
                  const myBooking = ride.myBooking;
                  return (
                    <div key={ride._id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-3">
                            <span className={`rounded-xl border px-3 py-1 text-xs font-bold uppercase ${rideStatusClass[ride.status] || rideStatusClass.active}`}>Ride {ride.status}</span>
                            {myBooking && <span className={`rounded-xl border px-3 py-1 text-xs font-bold uppercase ${bookingStatusClass[myBooking.status] || bookingStatusClass.booked}`}>Booking {myBooking.status}</span>}
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-700">{ride.fromLocation?.address}</p><p className="mt-3 text-sm font-semibold text-slate-700">{ride.toLocation?.address}</p></div>
                          <div className="flex flex-wrap gap-3 text-sm text-slate-600"><span className="rounded-xl bg-slate-100 px-3 py-2">{formatDeparture(ride.departureDateTime)}</span><span className="rounded-xl bg-blue-50 px-3 py-2 font-semibold text-blue-700">Driver: {ride.driver?.name || 'Driver'}</span></div>
                        </div>
                        <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          {myBooking ? (
                            <div className="space-y-3 text-sm text-slate-600">
                              <div className="flex items-center justify-between"><span>Seats booked</span><span className="font-semibold text-slate-900">{myBooking.seatsBooked}</span></div>
                              <div className="flex items-center justify-between"><span>Total price</span><span className="font-semibold text-slate-900">INR {myBooking.totalPrice}</span></div>
                              <div className="flex items-center justify-between"><span>Payment</span><span className="font-semibold capitalize text-slate-900">{myBooking.paymentMethod} ({myBooking.paymentStatus})</span></div>
                              {myBooking.pickupPoint?.address && <p className="text-sm text-slate-700">Pickup: {myBooking.pickupPoint.address}</p>}
                              {myBooking.status === 'booked' && ride.status !== 'cancelled' && <button onClick={() => cancelBooking(ride._id)} disabled={cancellingRideId === ride._id} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60">{cancellingRideId === ride._id ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-700" />Cancelling...</> : <><FiXCircle size={16} />Cancel booking</>}</button>}
                              {myBooking.status === 'completed' && !myBooking.ratedByPassenger && <button onClick={() => setFeedbackRide(ride)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-100"><FiStar size={16} />Rate Ride</button>}
                              {myBooking.status === 'completed' && myBooking.ratedByPassenger && <button disabled className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-500"><FiCheck size={16} />Rated</button>}
                            </div>
                          ) : <p className="text-sm text-slate-500">Booking details are unavailable.</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedRide && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl" initial={{ scale: 0.96, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 30 }}>
              <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="text-xl font-bold text-slate-900">Book a seat</h3><p className="text-sm text-slate-500">{selectedRide.fromLocation?.address} to {selectedRide.toLocation?.address}</p></div><button onClick={closeBookingModal} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100"><FiX size={20} /></button></div>
              <div className="grid lg:grid-cols-[1.1fr,0.9fr]">
                <div className="relative h-[360px] lg:h-[620px]">
                  {!isLoaded ? <div className="flex h-full items-center justify-center bg-slate-100"><span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" /></div> : (
                    <GoogleMap center={selectedRide?.fromLocation?.lat ? { lat: selectedRide.fromLocation.lat, lng: selectedRide.fromLocation.lng } : { lat: 0, lng: 0 }} zoom={10} mapContainerStyle={{ width: '100%', height: '100%' }} options={{ disableDefaultUI: true }} onClick={handleMapClick}>
                      {routeDirections && <DirectionsRenderer directions={routeDirections} options={{ polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5 } }} />}
                      {selectedRide?.fromLocation?.lat && <Marker position={{ lat: selectedRide.fromLocation.lat, lng: selectedRide.fromLocation.lng }} />}
                      {selectedRide?.toLocation?.lat && <Marker position={{ lat: selectedRide.toLocation.lat, lng: selectedRide.toLocation.lng }} />}
                      {pickupPoint && <Marker position={pickupPoint} />}
                    </GoogleMap>
                  )}
                  <div className="absolute left-4 top-4 rounded-xl bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow">Click on the route to set your pickup point</div>
                </div>
                <div className="max-h-[620px] space-y-5 overflow-y-auto p-5">
                  {isLoaded && <Autocomplete onLoad={setPickupAutocomplete} onPlaceChanged={handlePickupAutocomplete}><input type="text" placeholder="Search pickup point" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white" /></Autocomplete>}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Selected pickup point</p><p className="mt-2 text-sm font-semibold text-slate-800">{pickupAddress || 'No pickup point selected yet.'}</p></div>
                  <select value={seatsWanted} onChange={(e) => setSeatsWanted(Number(e.target.value))} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white">{Array.from({ length: Math.max(1, Math.min(selectedRide.seatsAvailable, 6)) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} seat{count > 1 ? 's' : ''}</option>)}</select>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div className="flex items-center justify-between text-sm text-slate-700"><span>Fixed price per seat</span><span className="font-semibold">INR {selectedRide.pricePerSeat}</span></div><div className="mt-3 flex items-center justify-between border-t border-emerald-100 pt-3"><span className="font-semibold text-slate-900">Total</span><span className="text-xl font-bold text-emerald-700">INR {totalPrice}</span></div></div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setPaymentMethod('cash')} className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${paymentMethod === 'cash' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Cash</button>
                    <button onClick={() => setPaymentMethod('online')} className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${paymentMethod === 'online' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Online / QR</button>
                  </div>
                  {paymentMethod === 'online' && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      {buildQrSource(selectedRide.driver?.driverQrCode || selectedRide.driverQrCode) ? <img src={buildQrSource(selectedRide.driver?.driverQrCode || selectedRide.driverQrCode)} alt="Driver QR" className="mx-auto max-h-56 rounded-2xl bg-white p-3 shadow-sm" /> : buildUpiIntent(selectedRide, totalPrice) ? <div className="mx-auto flex w-fit rounded-2xl bg-white p-4 shadow-sm"><QRCode size={180} value={buildUpiIntent(selectedRide, totalPrice)} /></div> : <p className="text-sm text-slate-500">No uploaded QR found yet. Payment will stay pending.</p>}
                      <p className="mt-3 text-xs text-slate-500">Online payments are stored as pending until confirmed.</p>
                    </div>
                  )}
                  {paymentMethod === 'cash' && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">Cash bookings are marked as pay-on-ride.</div>}
                  {bookingError && <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><FiAlertCircle size={16} />{bookingError}</div>}
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={submitBooking} disabled={booking} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-4 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60">{booking ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Booking seat...</> : <><FiCheck size={16} />Confirm booking for INR {totalPrice}</>}</motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaymentModal
        isOpen={!!feedbackRide}
        onClose={() => { setFeedbackRide(null); fetchMyBookings(); }}
        isCarpool={true}
        rideId={feedbackRide?._id}
        driverName={feedbackRide?.driver?.name}
        showCompletion={true}
        driverMode={false}
      />
    </motion.div>
  );
}

export default CarpoolRides;
