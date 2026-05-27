/**
 * offeredRideController.js
 * SECURITY FIXES:
 * - RCE-H-02: escapeRegex() prevents regex injection / ReDoS in search
 * - RCE-L-01: Generic error messages in all catch blocks
 */
const mongoose = require('mongoose');
const OfferedRide = require('../models/OfferedRide');
const User = require('../models/User');
const logger = require('../utils/logger');

const MAX_PICKUP_DISTANCE_FROM_ROUTE_KM = 10;

/**
 * Escape user input before using in a RegExp to prevent ReDoS (RCE-H-02).
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function normalizeLocation(location, label) {
  const lat = toFiniteNumber(location?.lat);
  const lng = toFiniteNumber(location?.lng);
  const address = typeof location?.address === 'string' ? location.address.trim() : '';

  if (!address || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: `${label} must include a valid address, latitude, and longitude.` };
  }

  return {
    value: {
      address,
      lat,
      lng,
    },
  };
}

function getDocumentId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function getActiveBookedSeats(ride) {
  return (ride.bookings || [])
    .filter((booking) => booking.status === 'booked')
    .reduce((sum, booking) => sum + Number(booking.seatsBooked || 0), 0);
}

async function normalizeLegacyCapacity(ride) {
  if (!ride) return ride;

  const hasModernCapacity =
    Number.isInteger(ride.totalSeats) &&
    ride.totalSeats > 0 &&
    Number.isInteger(ride.seatsAvailable) &&
    ride.seatsAvailable >= 0;

  if (hasModernCapacity) return ride;

  const legacyTotalSeats = Math.max(normalizeInteger(ride.seatsAvailable), 0);
  const legacyBookedSeats = Math.max(
    Number.isInteger(ride.seatsBooked) ? ride.seatsBooked : getActiveBookedSeats(ride),
    0
  );

  ride.totalSeats = legacyTotalSeats;
  ride.seatsBooked = legacyBookedSeats;
  ride.seatsAvailable = Math.max(legacyTotalSeats - legacyBookedSeats, 0);
  await ride.save();

  return ride;
}

function rideToClient(ride) {
  const plain = ride.toObject ? ride.toObject({ virtuals: true }) : { ...ride };
  const bookedSeats = Number.isInteger(plain.seatsBooked) ? plain.seatsBooked : getActiveBookedSeats(plain);
  const totalSeats = Number.isInteger(plain.totalSeats)
    ? plain.totalSeats
    : Math.max(Number(plain.seatsAvailable || 0), 0) + bookedSeats;
  const seatsAvailable = Number.isInteger(plain.seatsAvailable)
    ? plain.seatsAvailable
    : Math.max(totalSeats - bookedSeats, 0);

  return {
    ...plain,
    totalSeats,
    seatsBooked: bookedSeats,
    seatsAvailable,
    remainingSeats: seatsAvailable,
    driverId: plain.driver?._id || plain.driver || plain.driverId,
    dateTime: plain.departureDateTime || plain.dateTime,
    passengersBooked: plain.bookings || [],
  };
}

function buildAvailableRideQuery(query = {}) {
  const filters = {
    status: 'active',
    departureDateTime: { $gte: new Date() },
  };

  if (query.route) {
    // SECURITY: escape user input + length cap to prevent ReDoS (RCE-H-02)
    if (query.route.length > 100) return { error: 'Search term too long (max 100 characters)' };
    const routeRegex = new RegExp(escapeRegex(query.route.trim()), 'i');
    filters.$or = [
      { 'fromLocation.address': routeRegex },
      { 'toLocation.address': routeRegex },
    ];
  }

  if (query.from || query.to) {
    const extraRouteFilters = [];
    if (query.from) {
      if (query.from.length > 100) return { error: 'From search term too long (max 100 characters)' };
      extraRouteFilters.push({
        'fromLocation.address': new RegExp(escapeRegex(query.from.trim()), 'i'),
      });
    }
    if (query.to) {
      if (query.to.length > 100) return { error: 'To search term too long (max 100 characters)' };
      extraRouteFilters.push({
        'toLocation.address': new RegExp(escapeRegex(query.to.trim()), 'i'),
      });
    }

    if (filters.$or) {
      filters.$and = [{ $or: filters.$or }, ...extraRouteFilters];
      delete filters.$or;
    } else if (extraRouteFilters.length === 1) {
      Object.assign(filters, extraRouteFilters[0]);
    } else if (extraRouteFilters.length > 1) {
      filters.$and = extraRouteFilters;
    }
  }

  if (query.date) {
    const date = new Date(query.date);
    if (!Number.isNaN(date.getTime())) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filters.departureDateTime = { $gte: start, $lte: end };
    }
  }

  const minPrice = toFiniteNumber(query.minPrice);
  const maxPrice = toFiniteNumber(query.maxPrice);
  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    filters.pricePerSeat = {};
    if (!Number.isNaN(minPrice)) filters.pricePerSeat.$gte = minPrice;
    if (!Number.isNaN(maxPrice)) filters.pricePerSeat.$lte = maxPrice;
  }

  return filters;
}

function toCartesian(point, referenceLat) {
  const kmPerLat = 110.574;
  const kmPerLng = 111.32 * Math.cos((referenceLat * Math.PI) / 180);
  return {
    x: point.lng * kmPerLng,
    y: point.lat * kmPerLat,
  };
}

function pointToSegmentDistanceKm(point, segmentStart, segmentEnd) {
  const referenceLat = (segmentStart.lat + segmentEnd.lat + point.lat) / 3;
  const p = toCartesian(point, referenceLat);
  const a = toCartesian(segmentStart, referenceLat);
  const b = toCartesian(segmentEnd, referenceLat);

  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const magnitude = (abX * abX) + (abY * abY);

  if (magnitude === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((apX * abX) + (apY * abY)) / magnitude));
  const projectedX = a.x + (abX * t);
  const projectedY = a.y + (abY * t);

  return Math.hypot(p.x - projectedX, p.y - projectedY);
}

function isPickupNearRoute(pickupPoint, ride) {
  return (
    pointToSegmentDistanceKm(pickupPoint, ride.fromLocation, ride.toLocation) <=
    MAX_PICKUP_DISTANCE_FROM_ROUTE_KM
  );
}

function emitCarpoolUpdate(req, eventName, payload) {
  const io = req.app.get('io');
  if (!io) return;

  io.to('carpool_updates').emit(eventName, payload);

  if (payload?.ride?._id) {
    io.to(`carpool_ride_${payload.ride._id}`).emit(eventName, payload);
  }

  if (payload?.driverId) {
    io.to(`user_${payload.driverId}`).emit(eventName, payload);
  }

  if (payload?.passengerId) {
    io.to(`user_${payload.passengerId}`).emit(eventName, payload);
  }
}

exports.createOfferedRide = async (req, res) => {
  try {
    const {
      fromLocation,
      toLocation,
      departureDateTime,
      seatsAvailable,
      pricePerSeat,
      vehicleType,
      vehicleMake,
      vehicleModel,
      vehicleColor,
      vehiclePlate,
    } = req.body;

    const driver = await User.findById(req.user.id).select('driverQrCode');
    if (!driver) {
      return res.status(404).json({ error: 'Driver account not found.' });
    }

    const from = normalizeLocation(fromLocation, 'Starting point');
    if (from.error) return res.status(400).json({ error: from.error });

    const to = normalizeLocation(toLocation, 'Destination');
    if (to.error) return res.status(400).json({ error: to.error });

    const departure = new Date(departureDateTime);
    if (Number.isNaN(departure.getTime()) || departure <= new Date()) {
      return res.status(400).json({ error: 'Departure date and time must be in the future.' });
    }

    const totalSeats = normalizeInteger(seatsAvailable);
    if (Number.isNaN(totalSeats) || totalSeats < 1) {
      return res.status(400).json({ error: 'Available seats must be at least 1.' });
    }

    const fixedPricePerSeat = toFiniteNumber(pricePerSeat);
    if (Number.isNaN(fixedPricePerSeat) || fixedPricePerSeat <= 0) {
      return res.status(400).json({ error: 'Price per seat must be greater than 0.' });
    }

    const ride = await OfferedRide.create({
      driver: req.user.id,
      fromLocation: from.value,
      toLocation: to.value,
      departureDateTime: departure,
      totalSeats,
      seatsAvailable: totalSeats,
      seatsBooked: 0,
      pricePerSeat: fixedPricePerSeat,
      vehicleType: vehicleType || 'car',
      vehicleMake: vehicleMake || '',
      vehicleModel: vehicleModel || '',
      vehicleColor: vehicleColor || '',
      vehiclePlate: vehiclePlate || '',
      driverQrCode: driver.driverQrCode || null,
    });

    const populatedRide = await OfferedRide.findById(ride._id).populate(
      'driver',
      'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId'
    );

    const responseRide = rideToClient(populatedRide);
    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'created',
      ride: responseRide,
      driverId: getDocumentId(responseRide.driverId),
    });

    res.status(201).json({ ride: responseRide });
  } catch (err) {
    logger.error('offeredRide.create.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.updateOfferedRide = async (req, res) => {
  try {
    const ride = await OfferedRide.findOne({ _id: req.params.id, driver: req.user.id });
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    await normalizeLegacyCapacity(ride);

    if (ride.status !== 'active') {
      return res.status(400).json({ error: 'Only active rides can be edited.' });
    }

    const activeBookedSeats = getActiveBookedSeats(ride);

    if (req.body.fromLocation) {
      const from = normalizeLocation(req.body.fromLocation, 'Starting point');
      if (from.error) return res.status(400).json({ error: from.error });
      ride.fromLocation = from.value;
    }

    if (req.body.toLocation) {
      const to = normalizeLocation(req.body.toLocation, 'Destination');
      if (to.error) return res.status(400).json({ error: to.error });
      ride.toLocation = to.value;
    }

    if (req.body.departureDateTime) {
      const departure = new Date(req.body.departureDateTime);
      if (Number.isNaN(departure.getTime()) || departure <= new Date()) {
        return res.status(400).json({ error: 'Departure date and time must be in the future.' });
      }
      ride.departureDateTime = departure;
    }

    if (req.body.seatsAvailable != null) {
      const totalSeats = normalizeInteger(req.body.seatsAvailable);
      if (Number.isNaN(totalSeats) || totalSeats < 1) {
        return res.status(400).json({ error: 'Available seats must be at least 1.' });
      }
      if (totalSeats < activeBookedSeats) {
        return res.status(400).json({ error: 'Seat count cannot be lower than already booked seats.' });
      }
      ride.totalSeats = totalSeats;
      ride.seatsBooked = activeBookedSeats;
      ride.seatsAvailable = totalSeats - activeBookedSeats;
    }

    if (req.body.pricePerSeat != null) {
      const fixedPricePerSeat = toFiniteNumber(req.body.pricePerSeat);
      if (Number.isNaN(fixedPricePerSeat) || fixedPricePerSeat <= 0) {
        return res.status(400).json({ error: 'Price per seat must be greater than 0.' });
      }
      ride.pricePerSeat = fixedPricePerSeat;
    }

    if (typeof req.body.vehicleType === 'string') ride.vehicleType = req.body.vehicleType.trim();
    if (typeof req.body.vehicleMake === 'string') ride.vehicleMake = req.body.vehicleMake.trim();
    if (typeof req.body.vehicleModel === 'string') ride.vehicleModel = req.body.vehicleModel.trim();
    if (typeof req.body.vehicleColor === 'string') ride.vehicleColor = req.body.vehicleColor.trim();
    if (typeof req.body.vehiclePlate === 'string') ride.vehiclePlate = req.body.vehiclePlate.trim();

    await ride.save();

    const populatedRide = await OfferedRide.findById(ride._id)
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone');

    const responseRide = rideToClient(populatedRide);
    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'updated',
      ride: responseRide,
      driverId: req.user.id,
    });

    res.json({ ride: responseRide });
  } catch (err) {
    logger.error('offeredRide.update.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.getMyOfferedRides = async (req, res) => {
  try {
    const rides = await OfferedRide.find({ driver: req.user.id })
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone')
      .sort({ departureDateTime: 1 });

    res.json({ rides: rides.map(rideToClient) });
  } catch (err) {
    logger.error('offeredRide.getMyOffered.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.getAvailableRides = async (req, res) => {
  try {
    // SECURITY: buildAvailableRideQuery may return an error object for too-long search terms
    const queryOrError = buildAvailableRideQuery(req.query);
    if (queryOrError && queryOrError.error) {
      return res.status(400).json({ error: queryOrError.error });
    }

    const rides = await OfferedRide.find(queryOrError)
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .sort({ departureDateTime: 1 });

    const availableRides = rides.map(rideToClient).filter((ride) => ride.seatsAvailable > 0);
    res.json({ rides: availableRides });
  } catch (err) {
    logger.error('offeredRide.getAvailable.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.getMyBookedRides = async (req, res) => {
  try {
    const passengerObjectId = asObjectId(req.user.id);
    if (!passengerObjectId) {
      return res.status(400).json({ error: 'Invalid user identifier.' });
    }

    const rides = await OfferedRide.find({
      'bookings.passengerId': passengerObjectId,
    })
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone')
      .sort({ departureDateTime: -1 });

    const payload = rides.map((ride) => {
      const responseRide = rideToClient(ride);
      responseRide.myBooking = (responseRide.bookings || []).find(
        (booking) => getDocumentId(booking.passengerId) === req.user.id
      ) || null;
      return responseRide;
    });

    res.json({ rides: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.bookSeat = async (req, res) => {
  try {
    const passengerObjectId = asObjectId(req.user.id);
    if (!passengerObjectId) {
      return res.status(400).json({ error: 'Invalid user identifier.' });
    }

    const { rideId, seatsBooked, pickupPoint, paymentMethod } = req.body;
    if (!rideId || !mongoose.Types.ObjectId.isValid(rideId)) {
      return res.status(400).json({ error: 'A valid ride ID is required.' });
    }

    const seatsToBook = normalizeInteger(seatsBooked);
    if (Number.isNaN(seatsToBook) || seatsToBook < 1) {
      return res.status(400).json({ error: 'At least 1 seat must be booked.' });
    }

    const pickup = normalizeLocation(pickupPoint, 'Pickup point');
    if (pickup.error) {
      return res.status(400).json({ error: pickup.error });
    }

    const chosenPaymentMethod = paymentMethod === 'online' ? 'online' : 'cash';
    const ride = await OfferedRide.findById(rideId).populate(
      'driver',
      'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId'
    );

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    await normalizeLegacyCapacity(ride);

    if (getDocumentId(ride.driver) === req.user.id) {
      return res.status(400).json({ error: 'Drivers cannot book seats on their own rides.' });
    }

    if (ride.status !== 'active') {
      return res.status(400).json({ error: 'This ride is no longer available.' });
    }

    if (ride.departureDateTime <= new Date()) {
      ride.status = 'completed';
      await ride.save();
      return res.status(400).json({ error: 'This ride has already departed.' });
    }

    if (ride.seatsAvailable < seatsToBook) {
      return res.status(400).json({ error: `Only ${ride.seatsAvailable} seat(s) remaining.` });
    }

    const existingBooking = (ride.bookings || []).find(
      (booking) => booking.status === 'booked' && getDocumentId(booking.passengerId) === req.user.id
    );
    if (existingBooking) {
      return res.status(409).json({ error: 'You already have an active booking for this ride.' });
    }

    if (!isPickupNearRoute(pickup.value, ride)) {
      return res.status(400).json({
        error: 'Pickup point must be close to the offered route.',
      });
    }

    const totalPrice = seatsToBook * ride.pricePerSeat;

    const updatedRide = await OfferedRide.findOneAndUpdate(
      {
        _id: rideId,
        driver: { $ne: passengerObjectId },
        status: 'active',
        departureDateTime: { $gt: new Date() },
        seatsAvailable: { $gte: seatsToBook },
        bookings: {
          $not: {
            $elemMatch: {
              passengerId: passengerObjectId,
              status: 'booked',
            },
          },
        },
      },
      {
        $inc: {
          seatsAvailable: -seatsToBook,
          seatsBooked: seatsToBook,
        },
        $push: {
          bookings: {
            passengerId: passengerObjectId,
            seatsBooked: seatsToBook,
            pickupPoint: pickup.value,
            paymentMethod: chosenPaymentMethod,
            paymentStatus: 'pending',
            totalPrice,
            status: 'booked',
          },
        },
      },
      { new: true }
    )
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone');

    if (!updatedRide) {
      return res.status(409).json({
        error: 'This ride changed while you were booking. Please refresh and try again.',
      });
    }

    const responseRide = rideToClient(updatedRide);
    const booking = responseRide.bookings.find(
      (entry) => entry.status === 'booked' && getDocumentId(entry.passengerId) === req.user.id
    );

    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'booked',
      ride: responseRide,
      driverId: getDocumentId(responseRide.driverId),
    });

    emitCarpoolUpdate(req, 'carpool:booking-created', {
      type: 'booked',
      ride: responseRide,
      booking,
      driverId: getDocumentId(responseRide.driverId),
      passengerId: req.user.id,
    });

    res.status(201).json({
      message: 'Seat booked successfully.',
      ride: responseRide,
      booking,
      totalPrice,
    });
  } catch (err) {
    logger.error('offeredRide.bookSeat.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.updateDriverQr = async (req, res) => {
  try {
    const ride = await OfferedRide.findOne({ _id: req.params.id, driver: req.user.id });
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    ride.driverQrCode = typeof req.body.qrCodeUrl === 'string' && req.body.qrCodeUrl.trim()
      ? req.body.qrCodeUrl.trim()
      : null;
    await ride.save();

    const populatedRide = await OfferedRide.findById(ride._id).populate(
      'driver',
      'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId'
    );

    const responseRide = rideToClient(populatedRide);
    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'payment-updated',
      ride: responseRide,
      driverId: req.user.id,
    });

    res.json({ message: 'Driver QR updated successfully.', ride: responseRide });
  } catch (err) {
    logger.error('offeredRide.updateQR.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.cancelRide = async (req, res) => {
  try {
    const ride = await OfferedRide.findOne({ _id: req.params.id, driver: req.user.id })
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone');

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    if (ride.status === 'cancelled') {
      return res.status(400).json({ error: 'Ride is already cancelled.' });
    }

    ride.status = 'cancelled';
    ride.bookings.forEach((booking) => {
      if (booking.status === 'booked') {
        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
      }
    });
    await ride.save();

    const responseRide = rideToClient(ride);
    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'cancelled',
      ride: responseRide,
      driverId: req.user.id,
    });

    res.json({ message: 'Ride cancelled successfully.', ride: responseRide });
  } catch (err) {
    logger.error('offeredRide.cancel.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const ride = await OfferedRide.findById(req.params.id)
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone');

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    await normalizeLegacyCapacity(ride);

    const booking = ride.bookings.find(
      (entry) => entry.status === 'booked' && getDocumentId(entry.passengerId) === req.user.id
    );

    if (!booking) {
      return res.status(404).json({ error: 'Active booking not found.' });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    ride.seatsBooked = Math.max(ride.seatsBooked - booking.seatsBooked, 0);
    ride.seatsAvailable = Math.min(ride.seatsAvailable + booking.seatsBooked, ride.totalSeats);
    await ride.save();

    const refreshedRide = await OfferedRide.findById(ride._id)
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone');

    const responseRide = rideToClient(refreshedRide);
    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'booking-cancelled',
      ride: responseRide,
      driverId: getDocumentId(responseRide.driverId),
    });

    emitCarpoolUpdate(req, 'carpool:booking-cancelled', {
      type: 'booking-cancelled',
      ride: responseRide,
      driverId: getDocumentId(responseRide.driverId),
      passengerId: req.user.id,
    });

    res.json({ message: 'Booking cancelled successfully.', ride: responseRide });
  } catch (err) {
    logger.error('offeredRide.cancelBooking.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.completeRide = async (req, res) => {
  try {
    const ride = await OfferedRide.findOne({ _id: req.params.id, driver: req.user.id })
      .populate('driver', 'name rating phone vehicleType vehicleMake vehicleModel vehicleColor vehiclePlate driverQrCode upiId')
      .populate('bookings.passengerId', 'name rating phone');

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    if (ride.status === 'completed') {
      return res.status(400).json({ error: 'Ride is already completed.' });
    }
    if (ride.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled ride.' });
    }

    ride.status = 'completed';
    ride.bookings.forEach((booking) => {
      if (booking.status === 'booked') {
        booking.status = 'completed';
      }
    });

    await ride.save();

    const responseRide = rideToClient(ride);
    emitCarpoolUpdate(req, 'carpool:ride-updated', {
      type: 'completed',
      ride: responseRide,
      driverId: req.user.id,
    });

    res.json({ message: 'Ride marked as completed.', ride: responseRide });
  } catch (err) {
    logger.error('offeredRide.complete.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.rateRide = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ride = await OfferedRide.findById(req.params.id).populate('driver');
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({ error: 'Can only rate completed carpool rides' });
    }

    const passengerId = getDocumentId(req.user.id);
    const booking = ride.bookings.find(
      (b) => b.status === 'completed' && getDocumentId(b.passengerId) === passengerId
    );

    if (!booking) {
      return res.status(403).json({ error: 'Only passengers with a completed booking can rate this ride' });
    }

    if (booking.ratedByPassenger) {
      return res.status(400).json({ error: 'Ride already rated by this passenger' });
    }

    booking.ratedByPassenger = true;
    await ride.save();

    // Update driver's global rating
    if (ride.driver) {
      const driverObj = await User.findById(ride.driver._id || ride.driver);
      if (driverObj) {
        const prevTotal = driverObj.rating * driverObj.ratingsCount;
        driverObj.ratingsCount += 1;
        driverObj.rating = parseFloat(((prevTotal + rating) / driverObj.ratingsCount).toFixed(2));
        await driverObj.save();
      }
    }

    logger.info('offeredRide.rated', { rideId: req.params.id, rating, passengerId });
    res.json({ message: 'Rating submitted successfully', ride: rideToClient(ride) });
  } catch (err) {
    logger.error('offeredRide.rate.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};
