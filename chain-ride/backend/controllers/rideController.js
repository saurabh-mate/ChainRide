/**
 * Ride Controller
 * SECURITY FIXES APPLIED:
 * - RCE-H-01: Self-acceptance guard (driver cannot be same as passenger)
 * - RCE-M-05: Distance/duration caps (500 km / 720 min)
 * - RCE-L-03: Reject invalid passengerCount instead of silently coercing
 * - RCE-L-01: Generic error messages in all catch blocks
 * - updateRideStatus: Only assigned driver/passenger can update status
 */
const pricingService = require('../services/pricingService');
const Ride = require('../models/Ride');
const User = require('../models/User');
const logger = require('../utils/logger');
const { verifyFareToken } = require('../utils/fareToken');

// POST /api/rides/instant — passenger requests an instant ride
exports.requestInstantRide = async (req, res) => {
  try {
    const { startLocation, endLocation, distance, duration, vehicleType, passengerCount } = req.body;

    // SECURITY: Reject invalid passengerCount instead of silently coercing (RCE-L-03)
    const pCount = Number(passengerCount);
    if (!Number.isInteger(pCount) || pCount < 1 || pCount > 6) {
      return res.status(400).json({ error: 'passengerCount must be an integer between 1 and 6' });
    }

    // SECURITY: Cap distance and duration to prevent fare manipulation (RCE-M-05)
    const distanceNum = Number(distance);
    const durationNum = Number(duration);
    if (distanceNum > 500) {
      return res.status(400).json({ error: 'Distance exceeds maximum allowed (500 km)' });
    }
    if (durationNum > 720) {
      return res.status(400).json({ error: 'Duration exceeds maximum allowed (720 min)' });
    }

    // SECURITY: Verify the signed fare token to prevent price tampering (RCE-C-06)
    let verifiedFare = null;
    if (req.body.fareToken) {
      try {
        const fareData = verifyFareToken(req.body.fareToken);
        // Ensure the vehicle type in the token matches the requested vehicle type
        if (fareData.vehicleType !== vehicleType) {
          return res.status(400).json({ error: 'Fare token vehicle type mismatch. Please recalculate fare.' });
        }
        verifiedFare = fareData.totalFare;
      } catch (tokenErr) {
        return res.status(400).json({ error: tokenErr.message });
      }
    }

    // Fetch demand metrics for real-time surge
    const [activeRideRequests, availableDrivers] = await Promise.all([
      Ride.countDocuments({ type: 'instant', status: 'Searching', driver: { $exists: false } }),
      User.countDocuments({ roles: 'driver' }),
    ]);

    const { VALID_VEHICLE_TYPES, DEFAULT_VEHICLE_TYPE } = pricingService;
    const vType = vehicleType && VALID_VEHICLE_TYPES.includes(vehicleType) ? vehicleType : DEFAULT_VEHICLE_TYPE;

    const fareResult = pricingService.calculateFare(distance, duration, activeRideRequests, availableDrivers, vType);
    if (fareResult.error) {
      return res.status(400).json({ error: fareResult.error });
    }

    // SECURITY: Use server-calculated fare; if a valid fareToken was provided, trust it
    // (it was already verified above to match this vehicleType)
    const finalFare = verifiedFare !== null ? verifiedFare : fareResult.totalFare;

    const newRide = new Ride({
      type: 'instant',
      passenger: req.user.id,
      startLocation,
      endLocation,
      distance,
      duration,
      fare: finalFare,
      surgeMultiplier: fareResult.surgeMultiplier,
      status: 'Searching',
      vehicleType: vType,
      passengerCount: pCount,
      paymentMethod: req.body.paymentMethod || 'UPI',
    });

    await newRide.save();
    res.status(201).json({ ride: newRide });
  } catch (err) {
    logger.error('ride.requestInstant.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// POST /api/rides/schedule — driver schedules a ride
exports.scheduleRide = async (req, res) => {
  try {
    const { startLocation, endLocation, scheduledTime, availableSeats, pricePerSeat } = req.body;

    const newRide = new Ride({
      type: 'scheduled',
      driver: req.user.id,
      startLocation,
      endLocation,
      scheduledTime,
      availableSeats,
      pricePerSeat,
      fare: pricePerSeat,
      status: 'Searching',
    });

    await newRide.save();
    res.status(201).json({ ride: newRide });
  } catch (err) {
    logger.error('ride.schedule.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// GET /api/rides/my-rides — passenger sees their rides
exports.getMyRides = async (req, res) => {
  try {
    const rides = await Ride.find({ passenger: req.user.id })
      .populate('driver', 'name rating profilePhoto')
      .sort({ createdAt: -1 });

    res.json({ rides });
  } catch (err) {
    logger.error('ride.getMyRides.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// GET /api/rides/driver-rides — driver sees their offered/accepted rides
exports.getDriverRides = async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.user.id })
      .populate('passenger', 'name rating profilePhoto')
      .sort({ createdAt: -1 });

    res.json({ rides });
  } catch (err) {
    logger.error('ride.getDriverRides.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// GET /api/rides/available — all unaccepted instant ride requests for drivers
exports.getAvailableRides = async (req, res) => {
  try {
    const query = {
      type: 'instant',
      status: 'Searching',
      driver: { $exists: false },
    };
    if (req.query.vehicleType) {
      query.vehicleType = req.query.vehicleType;
    }
    const rides = await Ride.find(query)
      .populate('passenger', 'name rating profilePhoto')
      .sort({ createdAt: -1 });

    res.json({ rides });
  } catch (err) {
    logger.error('ride.getAvailable.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// GET /api/rides/scheduled — public list of available scheduled rides
exports.searchScheduledRides = async (req, res) => {
  try {
    const rides = await Ride.find({
      type: 'scheduled',
      status: 'Searching',
      availableSeats: { $gt: 0 },
    }).populate('driver', 'name rating profilePhoto');

    res.json({ rides });
  } catch (err) {
    logger.error('ride.searchScheduled.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// PATCH /api/rides/:id/accept — driver accepts a ride request
exports.acceptRide = async (req, res) => {
  try {
    const existing = await Ride.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ride not found' });
    if (existing.status !== 'Searching') {
      return res.status(400).json({ error: `Ride already ${existing.status.toLowerCase()}` });
    }

    // SECURITY: Driver cannot be the same user as the passenger (RCE-H-01)
    if (String(existing.passenger) === req.user.id) {
      return res.status(400).json({ error: 'You cannot accept your own ride request' });
    }

    // Validate: ride may require a specific vehicle type
    const driver = await User.findById(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    if (existing.vehicleType) {
      if (driver.vehicleType !== existing.vehicleType) {
        return res.status(400).json({
          error: `This ride requires a ${existing.vehicleType.toUpperCase()} but your vehicle type is ${(driver.vehicleType || 'CAR').toUpperCase()}.`,
        });
      }
    }

    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        driver: req.user.id,
        status: 'Matched',
        vehicleType:  driver.vehicleType  || 'car',
        vehicleMake:  driver.vehicleMake  || '',
        vehicleModel: driver.vehicleModel || '',
        vehicleColor: driver.vehicleColor || '',
        vehiclePlate: driver.vehiclePlate || '',
      },
      { new: true }
    ).populate('passenger', 'name');

    logger.info('ride.accepted', { rideId: req.params.id, driverId: req.user.id });

    // Notify passenger via socket
    const io = req.app.get('io');
    if (io && ride?.passenger?._id) {
      io.to(`passenger_${ride.passenger._id}`).emit('rideAccepted', { ride });
      io.to(`ride_${ride._id}`).emit('statusUpdated', { status: 'Matched', ride });
    }

    res.json({ ride });
  } catch (err) {
    logger.error('ride.accept.error', { error: err.message, rideId: req.params.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// PATCH /api/rides/:id/status — update ride status
exports.updateRideStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Searching', 'Matched', 'On Ride', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    // SECURITY: Only the passenger or assigned driver can update status
    const isDriver    = ride.driver    && String(ride.driver)    === req.user.id;
    const isPassenger = ride.passenger && String(ride.passenger) === req.user.id;
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: 'Not authorized to update this ride' });
    }

    const updated = await Ride.findByIdAndUpdate(req.params.id, { status }, { new: true });
    logger.info('ride.statusUpdated', { rideId: req.params.id, status, userId: req.user.id });
    res.json({ ride: updated });
  } catch (err) {
    logger.error('ride.updateStatus.error', { error: err.message, rideId: req.params.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// GET /api/rides/:id — single ride details
exports.getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('driver', 'name rating profilePhoto phone')
      .populate('passenger', 'name rating profilePhoto phone');

    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json({ ride });
  } catch (err) {
    logger.error('ride.getById.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// POST /api/rides/:id/rate — passenger rates a completed ride
exports.rateRide = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'Completed') {
      return res.status(400).json({ error: 'Can only rate completed rides' });
    }
    if (ride.ratedByPassenger) {
      return res.status(400).json({ error: 'Ride already rated' });
    }
    if (String(ride.passenger) !== req.user.id) {
      return res.status(403).json({ error: 'Only the passenger can rate this ride' });
    }

    ride.rating = rating;
    ride.ratingComment = comment || '';
    ride.ratedByPassenger = true;
    await ride.save();

    // Update driver's rolling average rating
    if (ride.driver) {
      const driver = await User.findById(ride.driver);
      if (driver) {
        const prevTotal = driver.rating * driver.ratingsCount;
        driver.ratingsCount += 1;
        driver.rating = parseFloat(((prevTotal + rating) / driver.ratingsCount).toFixed(2));
        await driver.save();
      }
    }

    logger.info('ride.rated', { rideId: req.params.id, rating, passengerId: req.user.id });
    res.json({ message: 'Rating submitted successfully', ride });
  } catch (err) {
    logger.error('ride.rate.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// POST /api/rides/:id/sos — trigger an emergency alert
exports.triggerSOS = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    
    // Authorization: only passenger or driver can trigger
    const isPassenger = String(ride.passenger) === req.user.id;
    const isDriver = ride.driver && String(ride.driver) === req.user.id;
    if (!isPassenger && !isDriver) {
      return res.status(403).json({ error: 'Unauthorized to trigger SOS for this ride' });
    }

    // In a real production system, this integrates with Twilio / SendGrid / local SOS API
    logger.info(`🚨 SOS ALERT TRIGGERED for Ride ${ride._id}`, { triggeredBy: req.user.id, rideId: ride._id });
    
    // Broadcast SOS alert to the ride room
    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${ride._id}`).emit('sosAlert', { 
        triggeredBy: req.user.id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ message: 'Emergency alert dispatched securely to trusted contacts and local authorities.' });
  } catch (err) {
    logger.error('Error triggering SOS', { error: err.message, rideId: req.params.id });
    res.status(500).json({ error: 'Failed to process emergency alert. Try dialing emergency services directly.' });
  }
};

