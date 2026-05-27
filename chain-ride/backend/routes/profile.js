/**
 * Profile Routes
 * SECURITY FIX: RCE-H-03 — Secure file upload middleware (type + size validation)
 */
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { apiLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting + auth to all profile routes
router.use(apiLimiter);
router.use(authMiddleware);

router.get('/',  profileController.getProfile);
router.put('/',  profileController.updateProfile);

// Upload avatar — images only, max 2 MB
router.post(
  '/upload-avatar',
  (req, res, next) => upload.single('avatar')(req, res, (err) => handleUploadError(err, req, res, next)),
  profileController.uploadAvatar
);

// Upload QR code — images only, max 2 MB
router.post(
  '/upload-qr',
  (req, res, next) => upload.single('qrCodeUrl')(req, res, (err) => handleUploadError(err, req, res, next)),
  profileController.uploadQr
);

module.exports = router;
