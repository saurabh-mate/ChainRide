/**
 * Ride Routes
 * SECURITY FIX: RCE-C-03 — General API rate limiting applied
 */
const express = require('express');
const router = express.Router();
const rideController = require('../controllers/rideController');
const authMiddleware = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Apply general rate limiting to all ride routes
router.use(apiLimiter);

// Passenger routes
router.post('/instant',     authMiddleware, rideController.requestInstantRide);
router.get('/my-rides',     authMiddleware, rideController.getMyRides);

// Driver routes
router.post('/schedule',    authMiddleware, rideController.scheduleRide);
router.get('/driver-rides', authMiddleware, rideController.getDriverRides);
router.get('/available',    authMiddleware, rideController.getAvailableRides);
router.patch('/:id/accept', authMiddleware, rideController.acceptRide);
router.patch('/:id/status', authMiddleware, rideController.updateRideStatus);

// Extra features
router.post('/:id/rate', authMiddleware, rideController.rateRide);
router.post('/:id/sos', authMiddleware, rideController.triggerSOS);

// Public / shared
router.get('/scheduled', rideController.searchScheduledRides);
router.get('/:id',       authMiddleware, rideController.getRideById);

module.exports = router;
