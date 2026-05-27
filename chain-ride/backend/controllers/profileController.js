/**
 * Profile Controller
 * SECURITY FIXES APPLIED:
 * - RCE-L-01: Generic error messages in all catch blocks
 */
const User = require('../models/User');
const Ride = require('../models/Ride');
const logger = require('../utils/logger');

// GET /api/profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [completed, cancelled, asDriver] = await Promise.all([
      Ride.countDocuments({ passenger: req.user.id, status: 'Completed' }),
      Ride.countDocuments({ passenger: req.user.id, status: 'Cancelled' }),
      Ride.countDocuments({ driver: req.user.id, status: 'Completed' }),
    ]);

    const earningsAgg = await Ride.aggregate([
      { $match: { driver: user._id, status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$fare' } } },
    ]);
    const earnings = earningsAgg[0]?.total || user.earnings;

    await User.findByIdAndUpdate(req.user.id, {
      completedRidesCount: completed,
      cancelledRidesCount: cancelled,
      earnings,
    });

    res.json({
      profile: {
        ...user.toObject(),
        completedRidesCount: completed,
        cancelledRidesCount: cancelled,
        driverRidesCount: asDriver,
        earnings,
      },
    });
  } catch (err) {
    logger.error('profile.getProfile.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// PUT /api/profile
exports.updateProfile = async (req, res) => {
  try {
    const allowedFields = [
      'name', 'email', 'phone', 'bio', 'city', 'dob', 'gender',
      'vehicleType', 'vehicleMake', 'vehicleModel', 'vehicleYear', 'vehiclePlate',
      'vehicleColor', 'licenseNumber', 'walletAddress', 'upiId',
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    logger.info('profile.updated', { userId: req.user.id, fields: Object.keys(updates) });
    res.json({ profile: user });
  } catch (err) {
    logger.error('profile.updateProfile.error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// POST /api/profile/upload-qr
exports.uploadQr = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const qrPath = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { driverQrCode: qrPath },
      { new: true }
    ).select('-password');
    res.json({ profile: user });
  } catch (err) {
    logger.error('profile.uploadQr.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// POST /api/profile/upload-avatar
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const avatarPath = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePhoto: avatarPath },
      { new: true }
    ).select('-password');
    res.json({ profile: user, avatarUrl: avatarPath });
  } catch (err) {
    logger.error('profile.uploadAvatar.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};
