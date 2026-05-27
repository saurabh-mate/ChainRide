/**
 * Socket.IO Handler
 * SECURITY FIXES APPLIED:
 * - RCE-C-04: JWT authentication on every socket connection
 * - RCE-M-04: updateStatus only callable by the assigned driver
 * - RCE-M-07: acceptRide uses socket.userId (verified), not client-supplied driverId
 * - RCE-H-01: Self-acceptance guard (driver cannot accept own passenger request via socket)
 * - RCE-L-05: Enhanced connection logs (userId + IP)
 */
const jwt = require('jsonwebtoken');
const Ride = require('../models/Ride');
const User = require('../models/User');
const mapsService = require('../services/mapsService');
const logger = require('../utils/logger');

/** Broadcast current surge multiplier to all connected clients */
async function broadcastSurgeUpdate(io) {
  const [activeRequests, drivers] = await Promise.all([
    Ride.countDocuments({ type: 'instant', status: 'Searching', driver: { $exists: false } }),
    User.countDocuments({ roles: 'driver' }),
  ]);
  const driversCount = drivers || 1;
  const ratio = activeRequests / driversCount;
  let surge = 1.0;
  if (ratio <= 1.0) surge = 1.0;
  else if (ratio <= 1.5) surge = 1.2;
  else if (ratio <= 2.0) surge = 1.5;
  else surge = 2.0;
  io.to('carpool_updates').emit('surgeUpdate', { surge, activeRequests, drivers: driversCount });
}

module.exports = (io) => {
  // ── SOCKET AUTH MIDDLEWARE (RCE-C-04) ──────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      logger.warn('socket.auth.rejected', {
        socketId: socket.id,
        ip: socket.handshake.address,
        reason: 'no_token',
      });
      return next(new Error('Authentication required. Provide a JWT token.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.userId);
      next();
    } catch (err) {
      logger.warn('socket.auth.rejected', {
        socketId: socket.id,
        ip: socket.handshake.address,
        reason: 'invalid_token',
      });
      return next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('socket.connected', {
      socketId: socket.id,
      userId: socket.userId,
      ip: socket.handshake.address,
    });

    // Automatically join the user's personal notification room
    socket.join(`user_${socket.userId}`);

    // Join a room by userId or rideId (still allowed, but now identity is verified)
    socket.on('joinRoom', (room) => {
      socket.join(room);
    });

    // Driver joins the global drivers room
    socket.on('joinDrivers', () => {
      socket.join('drivers');
    });

    // Join a specific ride room
    socket.on('joinRideRoom', (rideId) => {
      socket.join(`ride_${rideId}`);
    });

    // ── DRIVER LOCATION UPDATE ────────────────────────────────────────────
    socket.on('driverLocationUpdate', async (data) => {
      const { rideId, lat, lng } = data;
      if (!rideId || lat == null || lng == null) return;

      try {
        const ride = await Ride.findById(rideId);
        if (!ride || !ride.startLocation?.lat) return;

        // SECURITY: Only the assigned driver can send location updates
        if (String(ride.driver) !== socket.userId) {
          logger.warn('socket.location.unauthorized', {
            socketId: socket.id,
            userId: socket.userId,
            rideId,
          });
          return; // Silently ignore
        }

        const route = await mapsService.getRoute(lat, lng, ride.startLocation.lat, ride.startLocation.lng);
        io.to(`ride_${rideId}`).emit('locationUpdate', {
          lat,
          lng,
          eta: route.duration,
          distance: route.distance,
        });
      } catch (err) {
        io.to(`ride_${rideId}`).emit('locationUpdate', { lat, lng });
      }
    });

    // ── ACCEPT RIDE (RCE-M-07 + RCE-H-01) ───────────────────────────────
    socket.on('acceptRide', async (data) => {
      const { rideId } = data;
      // SECURITY: Use verified socket.userId — NEVER trust client-supplied driverId
      const driverId = socket.userId;

      try {
        const existing = await Ride.findById(rideId);
        if (!existing) {
          socket.emit('error', { message: 'Ride not found' });
          return;
        }

        // SECURITY: Driver cannot accept their own ride request
        if (String(existing.passenger) === driverId) {
          socket.emit('error', { message: 'You cannot accept your own ride request' });
          return;
        }

        if (existing.status !== 'Searching') {
          socket.emit('error', { message: `Ride already ${existing.status.toLowerCase()}` });
          return;
        }

        const ride = await Ride.findByIdAndUpdate(
          rideId,
          { status: 'Matched', driver: driverId },
          { new: true }
        ).populate('driver', 'name rating').populate('passenger', 'name phone');

        if (!ride) {
          socket.emit('error', { message: 'Ride not found' });
          return;
        }

        socket.join(`ride_${rideId}`);
        io.to(`passenger_${ride.passenger}`).emit('rideAccepted', { ride });
        io.to(`ride_${rideId}`).emit('statusUpdated', { status: 'Matched', ride });

        logger.info('socket.ride.accepted', { rideId, driverId, passengerId: String(ride.passenger) });
        await broadcastSurgeUpdate(io);

        if (ride.startLocation?.lat) {
          io.to(`ride_${rideId}`).emit('pickupInfo', {
            pickupLat: ride.startLocation.lat,
            pickupLng: ride.startLocation.lng,
            pickupAddress: ride.startLocation.address,
            eta: null,
            distance: null,
          });
        }
      } catch (err) {
        logger.error('socket.acceptRide.error', { error: err.message, rideId });
        socket.emit('error', { message: 'Failed to accept ride' });
      }
    });

    // ── UPDATE RIDE STATUS (RCE-M-04) ────────────────────────────────────
    socket.on('updateStatus', async (data) => {
      const { rideId, status } = data;
      try {
        const ride = await Ride.findById(rideId);
        if (!ride) {
          socket.emit('error', { message: 'Ride not found' });
          return;
        }

        // SECURITY: Only the assigned driver may update status via socket
        if (String(ride.driver) !== socket.userId) {
          logger.warn('socket.updateStatus.unauthorized', {
            socketId: socket.id,
            userId: socket.userId,
            rideId,
            assignedDriver: String(ride.driver),
          });
          socket.emit('error', { message: 'Not authorized to update this ride' });
          return;
        }

        const validStatuses = ['Searching', 'Matched', 'On Ride', 'Completed', 'Cancelled'];
        if (!validStatuses.includes(status)) {
          socket.emit('error', { message: 'Invalid status value' });
          return;
        }

        const updated = await Ride.findByIdAndUpdate(rideId, { status }, { new: true });
        io.to(`ride_${rideId}`).emit('statusUpdated', { status, ride: updated });
        io.to(`passenger_${updated.passenger}`).emit('statusUpdated', { status, ride: updated });

        logger.info('socket.ride.statusUpdated', { rideId, status, driverId: socket.userId });
        await broadcastSurgeUpdate(io);
      } catch (err) {
        logger.error('socket.updateStatus.error', { error: err.message, rideId });
        socket.emit('error', { message: 'Failed to update status' });
      }
    });

    // ── NEW RIDE REQUEST ──────────────────────────────────────────────────
    socket.on('newRideRequest', async (data) => {
      const { ride } = data;
      io.to('drivers').emit('newRideAvailable', { ride });
      await broadcastSurgeUpdate(io);
    });

    // ── SURGE REFRESH ─────────────────────────────────────────────────────
    socket.on('refreshSurge', async () => {
      await broadcastSurgeUpdate(io);
    });

    // ── IN-APP CHAT (Ephemeral) ───────────────────────────────────────────
    socket.on('chatMessage', (data) => {
      const { rideId, message } = data;
      if (!rideId || !message) return;
      
      // Broadcast the message to everyone in the ride room, including the sender
      io.to(`ride_${rideId}`).emit('receiveMessage', {
        userId: socket.userId,
        message,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      logger.info('socket.disconnected', { socketId: socket.id, userId: socket.userId });
    });
  });
};
