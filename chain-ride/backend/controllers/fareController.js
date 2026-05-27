/**
 * Fare Controller
 * SECURITY FIX: RCE-C-06 — fare quotes are cryptographically signed with HMAC.
 * The frontend receives a fareToken (HMAC-signed payload). When requesting a ride,
 * the server re-verifies the fareToken to ensure the fare hasn't been tampered with.
 *
 * Token format (base64url-encoded JSON): { fare, vehicleType, exp, sig }
 */
const crypto = require('crypto');
const Ride = require('../models/Ride');
const User = require('../models/User');
const { calculateFare, VALID_VEHICLE_TYPES, DEFAULT_VEHICLE_TYPE } = require('../services/pricingService');
const logger = require('../utils/logger');
const { signFareQuote, verifyFareToken, TOKEN_TTL_SECS } = require('../utils/fareToken');

// verifyFareToken is exported for use in rideController
module.exports.verifyFareToken = verifyFareToken;

/**
 * POST /api/fare/calculate
 * Calls server-side Google Maps, calculates fare, returns signed fareToken.
 * The fareToken must be sent back when the passenger books a ride.
 */
module.exports.calculateFare = async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropLat, dropLng, vehicleType } = req.body;

    const coords = [pickupLat, pickupLng, dropLat, dropLng];
    if (coords.some(c => typeof c !== 'number' || Number.isNaN(c))) {
      return res.status(400).json({ error: 'All coordinates must be valid numbers.' });
    }

    const vType = vehicleType && VALID_VEHICLE_TYPES.includes(vehicleType) ? vehicleType : DEFAULT_VEHICLE_TYPE;

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key is not configured.' });
    }

    const origin      = `${pickupLat},${pickupLng}`;
    const destination = `${dropLat},${dropLng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_API_KEY}`;

    let distanceKm, durationMins;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) {
        return res.status(400).json({ error: 'Could not find a route between the given locations.' });
      }
      const leg = data.routes[0].legs[0];
      distanceKm   = parseFloat((leg.distance.value / 1000).toFixed(3));
      durationMins = Math.ceil(leg.duration.value / 60);
    } catch {
      return res.status(500).json({ error: 'Failed to reach Google Maps API.' });
    }

    if (distanceKm <= 0) {
      return res.status(400).json({ error: 'Pickup and drop locations must be different.' });
    }

    const [activeRideRequests, availableDrivers] = await Promise.all([
      Ride.countDocuments({ type: 'instant', status: 'Searching', driver: { $exists: false } }),
      User.countDocuments({ roles: 'driver' }),
    ]);

    const fare = calculateFare(distanceKm, durationMins, activeRideRequests, availableDrivers, vType);

    // SECURITY: sign the fare quote (RCE-C-06)
    const farePayload = {
      totalFare:   fare.totalFare,
      vehicleType: vType,
      distanceKm,
      durationMins,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECS,
    };
    const fareToken = signFareQuote(farePayload);

    logger.info('fare.calculated', {
      userId: req.user.id,
      totalFare: fare.totalFare,
      vehicleType: vType,
      distanceKm,
    });

    res.json({
      distanceKm,
      durationMins,
      activeRideRequests,
      availableDrivers,
      vehicleType: vType,
      ...fare,
      fareToken, // frontend must echo this back when booking
      fareTokenExpiresIn: TOKEN_TTL_SECS,
    });
  } catch (err) {
    logger.error('fare.calculate.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

/**
 * GET /api/fare/preview
 * Returns estimates for all vehicle types (no fareToken — preview only).
 */
module.exports.previewFares = async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropLat, dropLng } = req.query;

    const coords = [pickupLat, pickupLng, dropLat, dropLng].map(Number);
    if (coords.some(c => Number.isNaN(c))) {
      return res.status(400).json({ error: 'All coordinates must be valid numbers.' });
    }

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key is not configured.' });
    }

    const origin      = `${coords[0]},${coords[1]}`;
    const destination = `${coords[2]},${coords[3]}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_API_KEY}`;

    let distanceKm, durationMins;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) {
        return res.status(400).json({ error: 'Could not find a route between the given locations.' });
      }
      const leg = data.routes[0].legs[0];
      distanceKm   = parseFloat((leg.distance.value / 1000).toFixed(3));
      durationMins = Math.ceil(leg.duration.value / 60);
    } catch {
      return res.status(500).json({ error: 'Failed to reach Google Maps API.' });
    }

    if (distanceKm <= 0) {
      return res.status(400).json({ error: 'Pickup and drop locations must be different.' });
    }

    const [activeRideRequests, availableDrivers] = await Promise.all([
      Ride.countDocuments({ type: 'instant', status: 'Searching', driver: { $exists: false } }),
      User.countDocuments({ roles: 'driver' }),
    ]);

    const previews = VALID_VEHICLE_TYPES.map(vt => {
      const fare = calculateFare(distanceKm, durationMins, activeRideRequests, availableDrivers, vt);
      return { vehicleType: vt, ...fare };
    });

    res.json({ distanceKm, durationMins, previews });
  } catch (err) {
    logger.error('fare.preview.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};
