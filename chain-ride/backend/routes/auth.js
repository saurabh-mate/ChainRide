/**
 * Auth Routes
 * SECURITY FIXES APPLIED:
 * - RCE-C-03: Rate limiting on login/register (5 attempts / 15 min)
 * - RCE-M-03 / Step 10: express-validator input validation
 */
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Validation rules for registration
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .isMobilePhone('any').withMessage('Invalid phone number format'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .isLength({ max: 128 }).withMessage('Password must be at most 128 characters'),
];

// Validation rules for login
const loginValidation = [
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login',    authLimiter, loginValidation,    authController.login);
router.post('/toggle-role', authMiddleware, authController.toggleRole);

module.exports = router;
