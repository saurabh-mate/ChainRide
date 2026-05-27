/**
 * Socket.IO Client — Lazy / Deferred Connection
 * SECURITY FIX: Socket is NOT created at module load time.
 * It is only created AFTER the user has a JWT token (i.e., after login).
 * This prevents the console flood of "Authentication required" errors on public pages.
 */
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('token') || null;
}

function syncSocketRooms() {
  if (!window.socket || !window.socket.connected) return;
  window.socket.emit('joinRoom', 'carpool_updates');
  const userId = localStorage.getItem('userId');
  if (userId) {
    window.socket.emit('joinRoom', `user_${userId}`);
    window.socket.emit('joinRoom', `passenger_${userId}`);
  }
}

function createSocket() {
  const token = getToken();
  if (!token) return null; // Don't connect without a token

  const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    syncSocketRooms();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
    if (err.message && (err.message.includes('Authentication') || err.message.includes('token'))) {
      // Token invalid — clean up and redirect
      if (window.socket) {
        window.socket.disconnect();
        window.socket = null;
      }
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
  });

  return socket;
}

/**
 * Initialize socket connection.
 * Idempotent — safe to call multiple times.
 * Called after successful login/registration.
 */
export function initSocket() {
  if (window.socket && window.socket.connected) return window.socket;
  if (window.socket) {
    window.socket.disconnect();
    window.socket = null;
  }
  window.socket = createSocket();
  return window.socket;
}

/**
 * Disconnect socket and clean up.
 * Called on logout.
 */
export function disconnectSocket() {
  if (window.socket) {
    window.socket.disconnect();
    window.socket = null;
  }
}

/**
 * Get the current socket instance (may be null if not logged in).
 */
export function getSocket() {
  return window.socket || null;
}

// Auto-init if token already exists (page refresh after login)
if (getToken() && !window.socket) {
  window.socket = createSocket();
}

export { syncSocketRooms };
export default getSocket;
