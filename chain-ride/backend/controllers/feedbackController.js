const Feedback = require('../models/Feedback');
const Ride = require('../models/Ride');
const User = require('../models/User');

exports.submitFeedback = async (req, res) => {
  try {
    const { rideId, rating, comment } = req.body;

    // Validation
    if (!rideId) return res.status(400).json({ error: 'Missing rideId' });
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Find the ride
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'Completed') {
      return res.status(400).json({ error: 'Can only submit feedback for completed rides' });
    }

    // Prevent duplicate feedback
    const existing = await Feedback.findOne({ rideId });
    if (existing) {
      return res.status(400).json({ error: 'Feedback already submitted for this ride' });
    }

    const passengerId = req.user.id;

    // Verify passenger owns this ride
    if (String(ride.passenger) !== passengerId) {
      return res.status(403).json({ error: 'Only the passenger can submit feedback' });
    }

    // Save feedback
    const feedback = new Feedback({
      rideId,
      passengerId,
      driverId: ride.driver,
      rating,
      comment: comment || '',
    });
    await feedback.save();

    // Update driver's average rating
    if (ride.driver) {
      const driver = await User.findById(ride.driver);
      if (driver) {
        const prevTotal = driver.rating * driver.ratingsCount;
        driver.ratingsCount += 1;
        driver.rating = parseFloat(((prevTotal + rating) / driver.ratingsCount).toFixed(2));
        await driver.save();
      }
    }

    res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
