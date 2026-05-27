import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { pageVariants, pageTransition } from '../components/Animations';
import {
  FiMapPin, FiClock, FiCreditCard, FiNavigation,
  FiRefreshCw, FiCheck, FiAlertCircle, FiUser, FiTrendingUp, FiUsers, FiCalendar, FiTruck
} from 'react-icons/fi';
import { apiGet, apiPatch } from '../utils/api';

const STATUS_COLORS = {
  Searching: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Matched: 'bg-blue-100 text-blue-700 border-blue-200',
  'On Ride': 'bg-green-100 text-green-700 border-green-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const VEHICLE_FILTER_OPTIONS = [
  { value: '',      label: 'All vehicles', emoji: '🚗' },
  { value: 'bike',  label: 'Bike',          emoji: '🏍️' },
  { value: 'auto',  label: 'Auto',          emoji: '🛺' },
  { value: 'mini',  label: 'Mini',           emoji: '🚗' },
  { value: 'sedan', label: 'Sedan',          emoji: '🚘' },
  { value: 'suv',   label: 'SUV',           emoji: '🚙' },
  { value: 'ev',    label: 'EV',            emoji: '⚡' },
];

function Dashboard() {
  const [role, setRole] = useState('passenger');
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');

  // Passenger state
  const [myRides, setMyRides] = useState([]);
  const [loadingMyRides, setLoadingMyRides] = useState(false);

  // Driver state
  const [availableRides, setAvailableRides] = useState([]);
  const [driverRides, setDriverRides] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [driverVehicleType, setDriverVehicleType] = useState('');

  const [toast, setToast] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Passenger: fetch my rides ─────────────────────────────────────────────
  const fetchMyRides = useCallback(async () => {
    if (!userId) return;
    setLoadingMyRides(true);
    try {
      const data = await apiGet('/rides/my-rides');
      setMyRides(data.rides || []);
    } catch {
      // silent fail
    } finally {
      setLoadingMyRides(false);
    }
  }, [userId]);

  // ── Driver: fetch available ride requests ──────────────────────────────────
  const fetchAvailableRides = useCallback(async () => {
    if (!userId) return;
    setLoadingAvailable(true);
    try {
      const params = driverVehicleType ? `?vehicleType=${driverVehicleType}` : '';
      const data = await apiGet(`/rides/available${params}`);
      setAvailableRides(data.rides || []);
    } catch {
      // silent fail
    } finally {
      setLoadingAvailable(false);
    }
  }, [userId, driverVehicleType]);

  // ── Driver: fetch driver's own rides ──────────────────────────────────────
  const fetchDriverRides = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await apiGet('/rides/driver-rides');
      setDriverRides(data.rides || []);
    } catch {
      // silent fail
    }
  }, [userId]);

  // ── Driver: accept a ride ──────────────────────────────────────────────────
  const acceptRide = async (rideId) => {
    if (!userId) { navigate('/auth'); return; }
    if (acceptingId) return;

    // Check vehicle type match before accepting
    const ride = availableRides.find(r => r._id === rideId);
    if (ride?.vehicleType && driverVehicleType && ride.vehicleType !== driverVehicleType) {
      showToast(`This request needs a ${ride.vehicleType.toUpperCase()} but you selected ${driverVehicleType.toUpperCase()}. Change your vehicle filter to accept.`, 'error');
      return;
    }

    setAcceptingId(rideId);
    try {
      await apiPatch(`/rides/${rideId}/accept`);

      if (window.socket) {
        window.socket.emit('joinRideRoom', rideId);
      }

      showToast('Ride accepted! Head to pickup.');
      setAvailableRides(prev => prev.filter(r => r._id !== rideId));
      await fetchDriverRides();
      navigate(`/live?rideId=${rideId}&driverMode=true`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  const rejectRide = async (rideId) => {
    if (!userId) { navigate('/auth'); return; }
    if (rejectingId) return;
    setRejectingId(rideId);
    try {
      await apiPatch(`/rides/${rideId}/status`, { status: 'Cancelled' });
      showToast('Ride request declined.');
      setAvailableRides(prev => prev.filter(r => r._id !== rideId));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRejectingId(null);
    }
  };

  // Load driver profile when switching to driver mode
  useEffect(() => {
    if (role === 'driver' && userId) {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      setDriverVehicleType(userData.vehicleType || '');
      fetchAvailableRides();
    }
  }, [role]);

  useEffect(() => {
    if (role === 'passenger') fetchMyRides();
    else { fetchAvailableRides(); fetchDriverRides(); }
  }, [role, fetchMyRides, fetchAvailableRides, fetchDriverRides]);

  const toggleRole = () => setRole(r => r === 'passenger' ? 'driver' : 'passenger');

  return (
    <motion.div
      className="min-h-screen bg-slate-50 p-4 md:p-8"
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold
              ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
          >
            {toast.type === 'error' ? <FiAlertCircle size={16} /> : <FiCheck size={16} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <FiNavigation className="text-white" size={16} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">ChainRide</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/wallet" className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
              <FiCreditCard size={22} />
            </Link>
            <Link to="/profile">
              <div className="h-9 w-9 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-md cursor-pointer">
                <FiUser size={15} />
              </div>
            </Link>
          </div>
        </header>

        {/* Role Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-slate-200 p-1 rounded-full flex relative shadow-inner">
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-md z-0 transition-transform duration-300 ease-in-out ${role === 'driver' ? 'translate-x-[calc(100%+8px)]' : 'translate-x-0'}`}
            />
            <button onClick={() => setRole('passenger')} className={`relative z-10 px-8 py-2.5 rounded-full font-semibold transition-colors duration-300 text-sm ${role === 'passenger' ? 'text-slate-900' : 'text-slate-500'}`}>
              Passenger
            </button>
            <button onClick={() => setRole('driver')} className={`relative z-10 px-8 py-2.5 rounded-full font-semibold transition-colors duration-300 text-sm ${role === 'driver' ? 'text-slate-900' : 'text-slate-500'}`}>
              Driver
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ── PASSENGER VIEW ────────────────────────────────────────────── */}
          {role === 'passenger' ? (
            <motion.div
              key="passenger"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Quick Action Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
                <motion.div
                  whileHover={{ y: -5, shadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                  className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-3xl p-6 shadow-lg cursor-pointer"
                  onClick={() => navigate('/ride')}
                >
                  <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
                    <FiMapPin size={22} />
                  </div>
                  <h3 className="text-xl font-bold mb-1">Book a Ride</h3>
                  <p className="text-blue-100 text-sm">Request instant or scheduled trips.</p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5 }}
                  className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-lg cursor-pointer"
                  onClick={() => navigate('/carpool')}
                >
                  <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
                    <FiUsers size={22} />
                  </div>
                  <h3 className="text-xl font-bold mb-1">Carpool Rides</h3>
                  <p className="text-emerald-50 text-sm">Browse seat-based rides with fixed pricing.</p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 cursor-pointer"
                  onClick={() => navigate('/wallet')}
                >
                  <div className="bg-purple-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-purple-600">
                    <FiCreditCard size={22} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-1">Wallet</h3>
                  <p className="text-slate-500 text-sm">Manage payments and crypto balance.</p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 cursor-pointer"
                  onClick={() => navigate('/profile')}
                >
                  <div className="bg-green-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-green-600">
                    <FiUser size={22} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-1">Profile</h3>
                  <p className="text-slate-500 text-sm">View ratings and ride history.</p>
                </motion.div>
              </div>

              {/* My Rides Section */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <FiClock size={18} className="text-blue-500" /> My Recent Rides
                  </h2>
                  <button
                    onClick={fetchMyRides}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
                    title="Refresh"
                  >
                    <FiRefreshCw size={16} className={loadingMyRides ? 'animate-spin' : ''} />
                  </button>
                </div>

                {loadingMyRides ? (
                  <div className="flex flex-col gap-3 py-4 w-full">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex flex-row p-4 border border-slate-100 rounded-xl bg-slate-50/50">
                        <div className="flex-1 space-y-3 py-1">
                          <div className="h-2 bg-slate-200 rounded w-1/4"></div>
                          <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                          <div className="h-3 bg-slate-200 rounded w-2/4"></div>
                        </div>
                        <div className="w-16 space-y-3 flex flex-col items-end">
                          <div className="h-6 w-16 bg-slate-200 rounded-lg"></div>
                          <div className="h-4 w-10 bg-slate-200 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : myRides.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-3 text-slate-300">
                    <FiMapPin size={40} className="opacity-30" />
                    <p className="text-slate-400 text-sm text-center">No rides yet.<br />
                      <button onClick={() => navigate('/ride')} className="text-blue-500 font-semibold hover:underline">Book your first ride</button>
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {myRides.slice(0, 5).map((ride) => (
                      <motion.div
                        key={ride._id}
                        whileHover={{ backgroundColor: '#f8fafc' }}
                        onClick={() => navigate(`/live?rideId=${ride._id}`)}
                        className="py-4 cursor-pointer rounded-xl px-2 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-1.5">
                              {new Date(ride.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                              <p className="text-sm text-slate-700 line-clamp-1">{ride.startLocation?.address || 'Unknown pickup'}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                              <p className="text-sm text-slate-700 line-clamp-1">{ride.endLocation?.address || 'Unknown destination'}</p>
                            </div>
                          </div>
                          <div className="ml-3 text-right shrink-0">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${STATUS_COLORS[ride.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {ride.status}
                            </span>
                            <p className="text-sm font-bold text-slate-800 mt-2">₹{ride.fare}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {myRides.length > 5 && (
                      <div className="pt-4 text-center">
                        <button onClick={() => navigate('/ride?tab=my-rides')} className="text-blue-600 text-sm font-semibold hover:underline">
                          View all {myRides.length} rides →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── DRIVER VIEW ──────────────────────────────────────────────── */
            <motion.div
              key="driver"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Driver Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <motion.div
                  whileHover={{ y: -4 }}
                  className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl cursor-pointer"
                  onClick={() => navigate('/offer-ride')}
                >
                  <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
                    <FiMapPin size={22} />
                  </div>
                  <h3 className="text-xl font-bold mb-1">Offer a Ride</h3>
                  <p className="text-slate-400 text-sm">Schedule a trip and earn by sharing seats.</p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -4 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 cursor-pointer"
                  onClick={() => navigate('/offer-ride?tab=my-rides')}
                >
                  <div className="bg-blue-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-blue-600">
                    <FiCalendar size={22} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-1">My Offered Rides</h3>
                  <p className="text-slate-500 text-sm">Track bookings, seats, and ride status live.</p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -4 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 cursor-pointer"
                  onClick={() => navigate('/wallet')}
                >
                  <div className="bg-green-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-green-600">
                    <FiTrendingUp size={22} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-1">Earnings</h3>
                  <p className="text-slate-500 text-sm">Platform payouts and crypto balance.</p>
                </motion.div>
              </div>

              {/* Incoming Ride Requests */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    Ride Requests
                    {availableRides.length > 0 && (
                      <span className="ml-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {availableRides.length}
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={fetchAvailableRides}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
                    title="Refresh"
                  >
                    <FiRefreshCw size={16} className={loadingAvailable ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Vehicle type filter for drivers */}
                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <FiTruck size={16} className="text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-600 font-medium shrink-0">I have a:</span>
                  <select
                    value={driverVehicleType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDriverVehicleType(val);
                      setLoadingAvailable(true);
                      const params = val ? `?vehicleType=${val}` : '';
                      apiGet(`/rides/available${params}`)
                        .then(data => setAvailableRides(data.rides || []))
                        .catch(() => setAvailableRides([]))
                        .finally(() => setLoadingAvailable(false));
                    }}
                    className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 font-semibold text-sm rounded-lg px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  >
                    {VEHICLE_FILTER_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.emoji} {opt.label}
                      </option>
                    ))}
                  </select>
                  {driverVehicleType && (
                    <span className="text-xs text-slate-400">
                      Showing only <span className="font-bold text-blue-600">{VEHICLE_FILTER_OPTIONS.find(o => o.value === driverVehicleType)?.label || driverVehicleType.toUpperCase()}</span> ride requests
                    </span>
                  )}
                </div>

                {loadingAvailable ? (
                  <div className="flex flex-col gap-3 py-4 w-full">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex flex-row p-4 border border-slate-100 rounded-xl bg-slate-50/50">
                        <div className="flex-1 space-y-3 py-1">
                          <div className="h-2 bg-slate-200 rounded w-1/4"></div>
                          <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                          <div className="h-3 bg-slate-200 rounded w-2/4"></div>
                        </div>
                        <div className="w-24 space-y-3 flex flex-col items-end justify-center">
                          <div className="h-10 w-24 bg-blue-100 rounded-xl"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : availableRides.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-3">
                    <FiNavigation size={40} className="text-slate-200" />
                    <p className="text-slate-400 text-sm text-center">
                      {driverVehicleType
                        ? `No ${driverVehicleType.toUpperCase()} ride requests right now.`
                        : 'No ride requests right now.'}
                      <br />Check back soon!
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {availableRides.map(ride => {
                      const vOpt = VEHICLE_FILTER_OPTIONS.find(v => v.value === ride.vehicleType);
                      return (
                      <motion.div
                        key={ride._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-slate-200 rounded-2xl p-4 bg-white hover:border-blue-200 hover:shadow-md transition-all"
                      >
                        {/* Header row: passenger info + fare */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                              {ride.passenger?.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{ride.passenger?.name || 'Passenger'}</p>
                              <p className="text-xs text-slate-400">{new Date(ride.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {new Date(ride.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xl font-extrabold text-green-600">₹{ride.fare}</span>
                            {ride.surgeMultiplier > 1 && (
                              <p className="text-[10px] text-orange-500 font-bold">⚡ {ride.surgeMultiplier}x surge</p>
                            )}
                          </div>
                        </div>

                        {/* Ride details row */}
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          {/* Vehicle type */}
                          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5">
                            <span className="text-sm">{vOpt?.emoji || '🚗'}</span>
                            <span className="text-xs font-bold text-blue-700">{ride.vehicleType?.toUpperCase() || 'MINI'}</span>
                          </div>
                          {/* Passenger count */}
                          <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 rounded-xl px-3 py-1.5">
                            <span className="text-sm">👥</span>
                            <span className="text-xs font-bold text-purple-700">{ride.passengerCount || 1} passenger{ride.passengerCount > 1 ? 's' : ''}</span>
                          </div>
                          {/* Payment method */}
                          <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${ride.paymentMethod === 'online' ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                            <span className="text-sm">{ride.paymentMethod === 'online' ? '💳' : '💵'}</span>
                            <span className={`text-xs font-bold ${ride.paymentMethod === 'online' ? 'text-blue-700' : 'text-amber-700'}`}>
                              {ride.paymentMethod === 'online' ? 'Online' : 'Cash'}
                            </span>
                          </div>
                          {/* Trip distance & duration */}
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
                            <span className="text-xs text-slate-500">{ride.distance} km</span>
                            <span className="text-xs text-slate-300">•</span>
                            <span className="text-xs text-slate-500">{ride.duration} mins</span>
                          </div>
                        </div>

                        {/* Route */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-green-600 font-bold uppercase tracking-wide mb-0.5">Pickup</p>
                              <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2">{ride.startLocation?.address || 'Unknown pickup'}</p>
                            </div>
                          </div>
                          <div className="w-0.5 h-3 bg-slate-300 ml-[4px]" />
                          <div className="flex items-start gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-red-600 font-bold uppercase tracking-wide mb-0.5">Drop</p>
                              <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2">{ride.endLocation?.address || 'Unknown destination'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => rejectRide(ride._id)}
                            disabled={rejectingId === ride._id || acceptingId === ride._id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                          >
                            {rejectingId === ride._id ? (
                              <span className="w-4 h-4 border-2 border-red-200/30 border-t-red-400 rounded-full animate-spin" />
                            ) : (
                              <>✕ Decline</>
                            )}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => acceptRide(ride._id)}
                            disabled={acceptingId === ride._id || rejectingId === ride._id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-md transition-colors disabled:opacity-60"
                          >
                            {acceptingId === ride._id ? (
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <><FiCheck size={15} /> Accept Ride</>
                            )}
                          </motion.button>
                        </div>
                      </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Driver's Active/Past Rides */}
              {driverRides.length > 0 && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-5">
                    <FiClock size={18} className="text-purple-500" /> My Trips
                  </h2>
                  <div className="divide-y divide-slate-50">
                    {driverRides.slice(0, 5).map((ride) => (
                      <motion.div
                        key={ride._id}
                        whileHover={{ backgroundColor: '#f8fafc' }}
                        onClick={() => navigate(`/live?rideId=${ride._id}&driverMode=true`)}
                        className="py-4 cursor-pointer rounded-xl px-2 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-1.5">
                              {new Date(ride.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-sm text-slate-700 line-clamp-1">{ride.startLocation?.address || 'Unknown'} → {ride.endLocation?.address || 'Unknown'}</p>
                            {ride.passenger && (
                              <p className="text-xs text-slate-400 mt-0.5">Passenger: {ride.passenger.name}</p>
                            )}
                          </div>
                          <div className="ml-3 text-right shrink-0">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${STATUS_COLORS[ride.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {ride.status}
                            </span>
                            <p className="text-sm font-bold text-slate-800 mt-2">₹{ride.fare}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default Dashboard;
