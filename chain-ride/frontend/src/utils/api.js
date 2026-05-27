/**
 * Centralised API Helper
 * SECURITY FIX: RCE-C-01 — sends JWT Bearer token instead of plain X-User-Id header
 * AUTO-LOGOUT: 401 responses clear the session and redirect to /auth
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function baseHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Handle 401 Unauthorized — clear session and redirect to login.
 */
function handle401() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('user');
  if (window.socket) {
    window.socket.disconnect();
    window.socket = null;
  }
  // Only redirect if not already on /auth page
  if (!window.location.pathname.startsWith('/auth')) {
    window.location.href = '/auth';
  }
}

async function handleResponse(res) {
  if (res.status === 401) {
    handle401();
    throw new Error('Session expired. Please log in again.');
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error: ${res.status}`);
  }
  if (!res.ok) {
    if (data.details && Array.isArray(data.details)) {
      throw new Error(data.details.join(' • '));
    }
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: baseHeaders(),
  });
  return handleResponse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPut(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPatch(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: baseHeaders(),
  });
  return handleResponse(res);
}

export async function apiUpload(path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: baseHeaders(), // No Content-Type — browser sets multipart boundary
    body: formData,
  });
  return handleResponse(res);
}

/**
 * Logout helper — clears session, disconnects socket, redirects
 */
export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('user');
  if (window.socket) {
    window.socket.disconnect();
    window.socket = null;
  }
  window.location.href = '/auth';
}
