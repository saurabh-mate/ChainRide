/**
 * Auth Controller
 * SECURITY FIXES APPLIED:
 * - RCE-C-01: Issues signed JWT on login/register (no longer trust X-User-Id)
 * - RCE-M-01: Bcrypt cost raised from 10 → 12
 * - RCE-H-05: Audit logging for login success/failure
 * - RCE-L-01: Generic error messages (no stack trace leaks)
 */
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

function issueToken(user) {
  return jwt.sign(
    { userId: user._id, phone: user.phone, roles: user.roles },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

exports.register = async (req, res) => {
  // express-validator result check
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array().map(e => e.msg) });
  }

  try {
    const { name, phone, password, roles, walletAddress } = req.body;

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this phone' });
    }

    // SECURITY: cost 12 per OWASP 2026 recommendation (was 10)
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      name,
      phone,
      password: hashedPassword,
      roles: roles || ['passenger'],
      walletAddress,
    });

    await user.save();

    const token = issueToken(user);

    logger.info('auth.register.success', { userId: String(user._id), phone, ip: req.ip });

    res.status(201).json({
      token,
      userId: user._id,
      user: { id: user._id, name, phone, roles: user.roles, walletAddress },
    });
  } catch (err) {
    logger.error('auth.register.error', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.login = async (req, res) => {
  // express-validator result check
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array().map(e => e.msg) });
  }

  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });

    if (!user) {
      logger.warn('auth.login.failed', { phone, ip: req.ip, reason: 'user_not_found' });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn('auth.login.failed', { phone, ip: req.ip, reason: 'wrong_password' });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = issueToken(user);

    logger.info('auth.login.success', { userId: String(user._id), phone, ip: req.ip });

    res.json({
      token,
      userId: user._id,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        roles: user.roles,
        activeRole: user.activeRole,
        walletAddress: user.walletAddress,
      },
    });
  } catch (err) {
    logger.error('auth.login.error', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

exports.toggleRole = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newRole = user.activeRole === 'passenger' ? 'driver' : 'passenger';

    if (!user.roles.includes(newRole)) {
      return res.status(403).json({ error: 'User does not have permission for this role' });
    }

    user.activeRole = newRole;
    await user.save();

    logger.info('auth.role.toggled', { userId: String(user._id), newRole, ip: req.ip });
    res.json({ activeRole: user.activeRole });
  } catch (err) {
    logger.error('auth.toggleRole.error', { error: err.message });
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};
