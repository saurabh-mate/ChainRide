const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  rideId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  driverId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  rating:      { type: Number, min: 1, max: 5, required: true },
  comment:     { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
