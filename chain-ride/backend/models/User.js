/**
 * User Model
 * SECURITY FIXES APPLIED:
 * - RCE-M-09: vehicleType enum unified with Ride model (superset)
 * - RCE-H-04: walletAddress validated as Ethereum address format
 * - RCE-L-02: email validated as proper format
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    {
    type: String,
    sparse: true,
    validate: {
      validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email format',
    },
  },
  phone:    { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // Role management
  roles:      [{ type: String, enum: ['passenger', 'driver'] }],
  activeRole: { type: String, enum: ['passenger', 'driver'], default: 'passenger' },

  // Profile details
  bio:         { type: String, default: '' },
  city:        { type: String, default: '' },
  dob:         { type: String, default: '' },
  gender:      { type: String, enum: ['male', 'female', 'other', ''], default: '' },

  // Driver-specific
  // SECURITY: unified enum (superset of both User + Ride models) — RCE-M-09
  vehicleType:   { type: String, enum: ['car', 'bike', 'auto', 'mini', 'sedan', 'suv', 'ev'], default: 'car' },
  vehicleMake:   { type: String, default: '' },
  vehicleModel:  { type: String, default: '' },
  vehicleYear:   { type: String, default: '' },
  vehiclePlate:  { type: String, default: '' },
  vehicleColor:  { type: String, default: '' },
  licenseNumber: { type: String, default: '' },

  // Wallet / Blockchain — SECURITY: validate Ethereum address format (RCE-H-04)
  walletAddress: {
    type: String,
    validate: {
      validator: (v) => !v || /^(0x)?[0-9a-fA-F]{40}$/.test(v),
      message: 'Invalid Ethereum wallet address format',
    },
  },
  upiId: { type: String, default: '' },

  // Media
  profilePhoto: { type: String, default: null },
  driverQrCode: { type: String, default: null },

  // Stats (auto-updated)
  rating:              { type: Number, default: 5.0 },
  ratingsCount:        { type: Number, default: 0 },
  earnings:            { type: Number, default: 0 },
  completedRidesCount: { type: Number, default: 0 },
  cancelledRidesCount: { type: Number, default: 0 },

  // Account
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
