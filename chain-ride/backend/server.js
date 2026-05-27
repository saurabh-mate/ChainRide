/**
 * Main Server Entry Point
 * SECURITY FIXES APPLIED:
 * - RCE-C-02: CORS restricted to allowlisted origins only
 * - RCE-C-05: Request body size limited to 10 KB
 * - RCE-L-01: Global 404 + generic error handler (no stack trace leaks in production)
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('./utils/logger');

const authRoutes        = require('./routes/auth');
const rideRoutes        = require('./routes/rides');
const profileRoutes     = require('./routes/profile');
const feedbackRoutes    = require('./routes/feedback');
const offeredRideRoutes = require('./routes/offeredRide');
const fareRoutes        = require('./routes/fare');
const mapsRoutes        = require('./routes/maps');
const setupSockets      = require('./sockets/rideSocket');

const app    = express();
const server = http.createServer(app);

// ── CORS ALLOWLIST (RCE-C-02) ──────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://chainride.saurabhmate.cloud',
  'http://localhost',
  'http://127.0.0.1',
  // No ports needed here anymore because Nginx handles the routing!
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman in dev)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('cors.rejected', { origin });
      callback(new Error(`CORS policy: origin '${origin}' is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);
app.set('trust proxy', 1); // trust first proxy for correct IP in rate-limit / logs

// ── SECURITY HEADERS (Helmet) ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // disabled — frontend sets its own CSP
  crossOriginEmbedderPolicy: false, // needed for Google Maps
}));

// ── HTTPS REDIRECT IN PRODUCTION ────────────────────────────────────────
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ── BODY PARSING WITH SIZE LIMIT (RCE-C-05) ───────────────────────────────
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── ROUTES ─────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/rides',         rideRoutes);
app.use('/api/profile',       profileRoutes);
app.use('/api/feedback',      feedbackRoutes);
app.use('/api/offered-rides', offeredRideRoutes);
app.use('/api/fare',          fareRoutes);
app.use('/api/maps',          mapsRoutes);  // Maps proxy — key stays server-side

// Static uploads (served read-only)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── DATABASE ───────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chainride';
mongoose.connect(MONGO_URI)
  .then(() => logger.info('MongoDB connected', { uri: MONGO_URI.replace(/\/\/.*@/, '//***@') }))
  .catch((err) => logger.error('MongoDB connection error', { error: err.message }));

// ── SOCKETS ────────────────────────────────────────────────────────────────
setupSockets(io);

// ── GLOBAL 404 ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── GLOBAL ERROR HANDLER (RCE-L-01) ───────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Handle CORS errors
  if (err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({ error: 'CORS: origin not allowed' });
  }
  // Handle body-parser size errors
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Maximum is 10 KB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  // Log the full error internally but never expose it externally
  logger.error('unhandled.server.error', { error: err.message, stack: err.stack, url: req.url });

  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'An unexpected error occurred. Please try again later.',
  });
});

// ── START ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`, { env: process.env.NODE_ENV || 'development' });
});
