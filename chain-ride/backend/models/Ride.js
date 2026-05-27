const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  type: { type: String, enum: ['instant', 'scheduled'], required: true },
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  startLocation: {
    address: String,
    lat: Number,
    lng: Number
  },
  endLocation: {
    address: String,
    lat: Number,
    lng: Number
  },
  
  status: { 
    type: String, 
    enum: ['Searching', 'Matched', 'On Ride', 'Completed', 'Cancelled'], 
    default: 'Searching' 
  },
  
  fare: { type: Number, required: true },
  surgeMultiplier: { type: Number, default: 1.0 },
  distance: { type: Number }, // in km
  duration: { type: Number }, // in mins
  passengerCount: { type: Number, default: 1, min: 1, max: 6 },

  // Scheduled ride specific fields
  scheduledTime: { type: Date },
  availableSeats: { type: Number },
  pricePerSeat: { type: Number },

  // Driver-specific (copied at acceptance time)
  // SECURITY: unified enum matching User model — RCE-M-09
  vehicleType:  { type: String, enum: ['car', 'bike', 'auto', 'mini', 'sedan', 'suv', 'ev'], default: 'car' },
  vehicleMake:  { type: String, default: '' },
  vehicleModel: { type: String, default: '' },
  vehicleColor: { type: String, default: '' },
  vehiclePlate: { type: String, default: '' },

  // Blockchain reference
  smartContractRideId: { type: Number },

  // Phase 2: Advanced Payment System
  paymentMethod: { type: String, enum: ['UPI', 'Cash', 'Blockchain'] },
  paymentStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },

  // Rating & Feedback
  rating: { type: Number, min: 1, max: 5 },
  ratingComment: { type: String, default: '' },
  ratedByPassenger: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Ride', rideSchema);
