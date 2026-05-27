import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import {
  FiAlertCircle,
  FiCalendar,
  FiCheck,
  FiChevronLeft,
  FiMapPin,
  FiRefreshCw,
  FiTruck,
  FiUsers,
  FiXCircle,
} from 'react-icons/fi';
import { pageTransition, pageVariants } from '../components/Animations';
import { apiGet, apiPatch, apiPost } from '../utils/api';
import { getSocket, syncSocketRooms } from '../utils/socket';

const libraries = ['places'];

const STATUS_META = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const EMPTY_FORM = {
  fromAddress: '',
  toAddress: '',
  fromLocation: null,
  toLocation: null,
  departureDate: '',
  departureTime: '',
  seatsAvailable: 1,
  pricePerSeat: '',
  vehicleType: 'car',
  vehicleMake: '',
  vehicleModel: '',
  vehicleColor: '',
  vehiclePlate: '',
};

function formatDeparture(dateTime) {
  return new Date(dateTime).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function OfferRide() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'offer';

  const [form, setForm] = useState(EMPTY_FORM);
  const [fromAutocomplete, setFromAutocomplete] = useState(null);
  const [toAutocomplete, setToAutocomplete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [rides, setRides] = useState([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [listError, setListError] = useState('');
  const [cancellingRideId, setCancellingRideId] = useState('');
  const [completingRideId, setCompletingRideId] = useState('');

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const todayMin = useMemo(() => new Date().toISOString().split('T')[0], []);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleFromPlaceChanged = () => {
    if (!fromAutocomplete) return;
    const place = fromAutocomplete.getPlace();
    if (!place?.geometry?.location) return;

    setForm((current) => ({
      ...current,
      fromAddress: place.formatted_address || current.fromAddress,
      fromLocation: {
        address: place.formatted_address || current.fromAddress,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      },
    }));
  };

  const handleToPlaceChanged = () => {
    if (!toAutocomplete) return;
    const place = toAutocomplete.getPlace();
    if (!place?.geometry?.location) return;

    setForm((current) => ({
      ...current,
      toAddress: place.formatted_address || current.toAddress,
      toLocation: {
        address: place.formatted_address || current.toAddress,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      },
    }));
  };

  const fetchMyRides = async () => {
    setLoadingRides(true);
    setListError('');
    try {
      const data = await apiGet('/offered-rides/mine');
      setRides(data.rides || []);
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoadingRides(false);
    }
  };

  useEffect(() => {
    if (tab === 'my-rides') {
      fetchMyRides();
    }
  }, [tab]);

  useEffect(() => {
    syncSocketRooms();

    const refreshDriverRides = (payload) => {
      if (tab !== 'my-rides') return;
      const payloadDriverId = payload?.driverId || payload?.ride?.driverId;
      const currentUserId = localStorage.getItem('userId');
      if (payloadDriverId && String(payloadDriverId) !== String(currentUserId)) return;
      fetchMyRides();
    };

    getSocket().on('carpool:ride-updated', refreshDriverRides);
    getSocket().on('carpool:booking-created', refreshDriverRides);
    getSocket().on('carpool:booking-cancelled', refreshDriverRides);

    return () => {
      getSocket().off('carpool:ride-updated', refreshDriverRides);
      getSocket().off('carpool:booking-created', refreshDriverRides);
      getSocket().off('carpool:booking-cancelled', refreshDriverRides);
    };
  }, [tab]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!form.fromLocation || !form.toLocation) {
      setError('Select both start and destination from the map suggestions.');
      return;
    }

    if (!form.departureDate || !form.departureTime) {
      setError('Choose a future departure date and time.');
      return;
    }

    const departureDateTime = new Date(`${form.departureDate}T${form.departureTime}`);
    if (Number.isNaN(departureDateTime.getTime()) || departureDateTime <= new Date()) {
      setError('Departure must be in the future.');
      return;
    }

    if (!Number(form.pricePerSeat) || Number(form.pricePerSeat) <= 0) {
      setError('Enter a fixed price per seat greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/offered-rides', {
        fromLocation: form.fromLocation,
        toLocation: form.toLocation,
        departureDateTime,
        seatsAvailable: Number(form.seatsAvailable),
        pricePerSeat: Number(form.pricePerSeat),
        vehicleType: form.vehicleType,
        vehicleMake: form.vehicleMake.trim(),
        vehicleModel: form.vehicleModel.trim(),
        vehicleColor: form.vehicleColor.trim(),
        vehiclePlate: form.vehiclePlate.trim(),
      });

      setForm(EMPTY_FORM);
      setSuccessMessage('Ride offered successfully. You can track bookings below.');
      navigate('/offer-ride?tab=my-rides');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRide = async (rideId) => {
    setCancellingRideId(rideId);
    setListError('');
    try {
      await apiPatch(`/offered-rides/${rideId}/cancel`);
      await fetchMyRides();
    } catch (err) {
      setListError(err.message);
    } finally {
      setCancellingRideId('');
    }
  };

  const completeRide = async (rideId) => {
    setCompletingRideId(rideId);
    setListError('');
    try {
      await apiPatch(`/offered-rides/${rideId}/complete`);
      await fetchMyRides();
    } catch (err) {
      setListError(err.message);
    } finally {
      setCompletingRideId('');
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-slate-50"
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
            >
              <FiChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Offer a Ride</h1>
              <p className="text-sm text-slate-500">Create and manage scheduled carpool rides.</p>
            </div>
          </div>

          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            <button
              onClick={() => navigate('/offer-ride?tab=offer')}
              className={`rounded-lg px-4 py-2 font-semibold transition ${
                tab === 'offer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Offer Ride
            </button>
            <button
              onClick={() => navigate('/offer-ride?tab=my-rides')}
              className={`rounded-lg px-4 py-2 font-semibold transition ${
                tab === 'my-rides' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              My Offered Rides
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 md:p-6">
        {tab === 'offer' ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <FiAlertCircle size={16} />
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <FiCheck size={16} />
                  {successMessage}
                </div>
              )}

              <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
                  <FiMapPin className="text-blue-500" size={16} />
                  Route
                </h2>

                {!isLoaded ? (
                  <p className="text-sm text-slate-400">Loading map search...</p>
                ) : (
                  <div className="space-y-4">
                    <Autocomplete onLoad={setFromAutocomplete} onPlaceChanged={handleFromPlaceChanged}>
                      <input
                        type="text"
                        value={form.fromAddress}
                        onChange={(event) => handleChange('fromAddress', event.target.value)}
                        placeholder="From"
                        className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                        required
                      />
                    </Autocomplete>
                    <Autocomplete onLoad={setToAutocomplete} onPlaceChanged={handleToPlaceChanged}>
                      <input
                        type="text"
                        value={form.toAddress}
                        onChange={(event) => handleChange('toAddress', event.target.value)}
                        placeholder="To"
                        className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                        required
                      />
                    </Autocomplete>
                    <p className="text-xs text-slate-400">
                      Pick places from the autocomplete list so the exact coordinates are saved.
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
                  <FiCalendar className="text-indigo-500" size={16} />
                  Departure
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
                    <input
                      type="date"
                      min={todayMin}
                      value={form.departureDate}
                      onChange={(event) => handleChange('departureDate', event.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Time</label>
                    <input
                      type="time"
                      value={form.departureTime}
                      onChange={(event) => handleChange('departureTime', event.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                      required
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
                  <FiUsers className="text-emerald-500" size={16} />
                  Seats and Pricing
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Available seats</label>
                    <select
                      value={form.seatsAvailable}
                      onChange={(event) => handleChange('seatsAvailable', event.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                    >
                      {[1, 2, 3, 4, 5, 6].map((seatCount) => (
                        <option key={seatCount} value={seatCount}>
                          {seatCount} seat{seatCount > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Fixed price per seat</label>
                    <input
                      type="number"
                      min="1"
                      value={form.pricePerSeat}
                      onChange={(event) => handleChange('pricePerSeat', event.target.value)}
                      placeholder="Example: 250"
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                      required
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
                  <FiTruck className="text-slate-500" size={16} />
                  Vehicle details
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Vehicle type</label>
                    <select
                      value={form.vehicleType}
                      onChange={(event) => handleChange('vehicleType', event.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                    >
                      <option value="car">Car</option>
                      <option value="bike">Bike</option>
                      <option value="auto">Auto</option>
                      <option value="ev">EV</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={form.vehicleMake}
                    onChange={(event) => handleChange('vehicleMake', event.target.value)}
                    placeholder="Make"
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                  />
                  <input
                    type="text"
                    value={form.vehicleModel}
                    onChange={(event) => handleChange('vehicleModel', event.target.value)}
                    placeholder="Model"
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                  />
                  <input
                    type="text"
                    value={form.vehicleColor}
                    onChange={(event) => handleChange('vehicleColor', event.target.value)}
                    placeholder="Color"
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                  />
                  <input
                    type="text"
                    value={form.vehiclePlate}
                    onChange={(event) => handleChange('vehiclePlate', event.target.value)}
                    placeholder="Plate number"
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </section>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-4 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Publishing ride...
                  </>
                ) : (
                  <>
                    <FiCheck size={16} />
                    Publish Ride Offer
                  </>
                )}
              </motion.button>
            </form>

            <aside className="space-y-5">
              <div className="rounded-3xl border border-slate-100 bg-slate-900 p-6 text-white shadow-xl">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Carpool driver</p>
                <h2 className="mt-3 text-2xl font-bold">Fixed seat pricing only</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Passengers pay the price you set per seat. Booking totals are always:
                  seats booked x price per seat.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h3 className="font-bold text-slate-900">What gets stored</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  <li>Start, destination, departure time, and available seats</li>
                  <li>Fixed price per seat with optional vehicle details</li>
                  <li>Passenger bookings with pickup point and payment method</li>
                  <li>Ride status changes and live seat availability</li>
                </ul>
              </div>
            </aside>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-slate-900">My Offered Rides</h2>
                <p className="text-sm text-slate-500">Monitor bookings, seat counts, and cancellations.</p>
              </div>
              <button
                onClick={fetchMyRides}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FiRefreshCw className={loadingRides ? 'animate-spin' : ''} size={14} />
                  Refresh
                </span>
              </button>
            </div>

            {listError && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <FiAlertCircle size={16} />
                {listError}
              </div>
            )}

            {loadingRides ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-100 bg-white shadow-sm">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
              </div>
            ) : rides.length === 0 ? (
              <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                <FiMapPin className="mx-auto mb-4 text-slate-300" size={36} />
                <p className="text-sm text-slate-500">No offered rides yet. Create your first ride from the Offer Ride tab.</p>
              </div>
            ) : (
              <div className="grid gap-5">
                {rides.map((ride) => (
                  <div key={ride._id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`rounded-xl border px-3 py-1 text-xs font-bold uppercase ${STATUS_META[ride.status] || STATUS_META.active}`}
                          >
                            {ride.status}
                          </span>
                          <span className="text-sm text-slate-500">{formatDeparture(ride.departureDateTime)}</span>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">From</p>
                              <p className="text-sm font-semibold text-slate-700">{ride.fromLocation?.address}</p>
                            </div>
                          </div>
                          <div className="mt-4 flex items-start gap-3">
                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">To</p>
                              <p className="text-sm font-semibold text-slate-700">{ride.toLocation?.address}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                          <span className="rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">
                            Seats left: {ride.seatsAvailable}/{ride.totalSeats}
                          </span>
                          <span className="rounded-xl bg-blue-50 px-3 py-2 font-semibold text-blue-700">
                            Price per seat: INR {ride.pricePerSeat}
                          </span>
                          {(ride.vehicleMake || ride.vehicleModel) && (
                            <span className="rounded-xl bg-slate-100 px-3 py-2 font-semibold text-slate-700">
                              {ride.vehicleType?.toUpperCase()} • {ride.vehicleMake} {ride.vehicleModel} {ride.vehicleColor ? `- ${ride.vehicleColor}` : ''} {ride.vehiclePlate ? `• ${ride.vehiclePlate}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-full max-w-sm space-y-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <h3 className="font-semibold text-slate-800">Passenger bookings</h3>
                          {ride.bookings?.filter((booking) => booking.status === 'booked').length ? (
                            <div className="mt-3 space-y-3">
                              {ride.bookings
                                .filter((booking) => booking.status === 'booked')
                                .map((booking) => (
                                  <div key={booking._id} className="rounded-2xl bg-white p-3 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <p className="font-semibold text-slate-800">
                                          {booking.passengerId?.name || 'Passenger'}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          {booking.seatsBooked} seat{booking.seatsBooked > 1 ? 's' : ''} • {booking.paymentMethod}
                                        </p>
                                      </div>
                                      <span className="text-sm font-bold text-slate-800">INR {booking.totalPrice}</span>
                                    </div>
                                    {booking.pickupPoint?.address && (
                                      <p className="mt-2 text-xs text-slate-500">
                                        Pickup: {booking.pickupPoint.address}
                                      </p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500">No bookings yet for this ride.</p>
                          )}
                        </div>

                        {ride.status === 'active' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => completeRide(ride._id)}
                              disabled={completingRideId === ride._id || cancellingRideId === ride._id}
                              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                            >
                              {completingRideId === ride._id ? (
                                <>
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                  Completing...
                                </>
                              ) : (
                                <>
                                  <FiCheck size={16} />
                                  Complete
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => cancelRide(ride._id)}
                              disabled={cancellingRideId === ride._id || completingRideId === ride._id}
                              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                            >
                              {cancellingRideId === ride._id ? (
                                <>
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-700" />
                                  Cancelling...
                                </>
                              ) : (
                                <>
                                  <FiXCircle size={16} />
                                  Cancel
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default OfferRide;
