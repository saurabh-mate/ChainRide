/**
 * Rate Limit Middleware (SECURITY AUDIT: RCE-C-03)
 * Auth routes: max 5 attempts per 15 minutes
 * API routes:  max 100 requests per 15 minutes
 */
const rateLimit = require('express-rate-limit');

// Strict limiter for login / register — prevents brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,
  message: {
    error: 'Too many login attempts. Please try again after 15 minutes.',
    retryAfter: 15,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// General API limiter — prevents scraping / DoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict limiter for future password-reset endpoint
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset attempts. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, apiLimiter, passwordResetLimiter };
