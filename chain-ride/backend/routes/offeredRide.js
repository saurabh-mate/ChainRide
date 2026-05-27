const express = require('express');
const router = express.Router();
const offeredRideController = require('../controllers/offeredRideController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Driver: create / list my offered rides
router.post('/', offeredRideController.createOfferedRide);
router.get('/mine', offeredRideController.getMyOfferedRides);
router.patch('/:id/qr', offeredRideController.updateDriverQr);
router.patch('/:id/cancel', offeredRideController.cancelRide);

// Passenger: available rides / my bookings
router.get('/available', offeredRideController.getAvailableRides);
router.get('/my-bookings', offeredRideController.getMyBookedRides);

// Booking
router.post('/book', offeredRideController.bookSeat);
router.patch('/:id/booking/cancel', offeredRideController.cancelBooking);
router.patch('/:id', offeredRideController.updateOfferedRide);

// Completion and Rating
router.patch('/:id/complete', offeredRideController.completeRide);
router.post('/:id/rate', offeredRideController.rateRide);

module.exports = router;
