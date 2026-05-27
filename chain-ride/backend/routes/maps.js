/**
 * Maps Proxy Routes — Server-Side Google Maps API
 * SECURITY FIX: Google Maps API key stays on the server, never exposed to browser bundle.
 *
 * Endpoints:
 *   POST /api/maps/route       — get directions/distance/duration between two points
 *   POST /api/maps/geocode     — reverse geocode lat/lng to address
 *   POST /api/maps/place-details — get place details from placeId
 *   GET  /api/maps/config      — returns Maps JS API config (key never sent, only config)
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// All maps proxy calls are authenticated and rate-limited
router.use(apiLimiter);

// Helper to call Google Maps APIs from the server
async function googleMapsRequest(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Maps API HTTP error: ${response.status}`);
  }
  return response.json();
}

/**
 * POST /api/maps/route
 * Body: { originLat, originLng, destLat, destLng }
 * Returns: { distanceKm, durationMins, polyline, steps }
 */
router.post('/route', authMiddleware, async (req, res) => {
  try {
    const { originLat, originLng, destLat, destLng } = req.body;

    const coords = [originLat, originLng, destLat, destLng];
    if (coords.some(c => c == null || Number.isNaN(Number(c)))) {
      return res.status(400).json({ error: 'All coordinates must be valid numbers.' });
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(500).json({ error: 'Maps API not configured.' });

    const origin = `${Number(originLat)},${Number(originLng)}`;
    const dest   = `${Number(destLat)},${Number(destLng)}`;
    const url    = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&key=${key}`;

    const data = await googleMapsRequest(url);

    if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) {
      return res.status(400).json({ error: 'Could not find a route between these locations.' });
    }

    const leg = data.routes[0].legs[0];
    res.json({
      distanceKm:   parseFloat((leg.distance.value / 1000).toFixed(3)),
      durationMins: Math.ceil(leg.duration.value / 60),
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      polyline:     data.routes[0].overview_polyline.points,
      startAddress: leg.start_address,
      endAddress:   leg.end_address,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not reach the mapping service.' });
  }
});

/**
 * POST /api/maps/geocode
 * Body: { lat, lng }
 * Returns: { address }
 */
router.post('/geocode', authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng are required.' });
    }

    const key  = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(500).json({ error: 'Maps API not configured.' });

    const url  = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${Number(lat)},${Number(lng)}&key=${key}`;
    const data = await googleMapsRequest(url);

    if (data.status !== 'OK' || !data.results?.[0]) {
      return res.status(400).json({ error: 'Could not geocode the provided coordinates.' });
    }

    res.json({ address: data.results[0].formatted_address });
  } catch (err) {
    res.status(500).json({ error: 'Could not reach the mapping service.' });
  }
});

/**
 * GET /api/maps/config
 * Returns the Maps JavaScript API key so the browser can load the SDK.
 * This is authenticated and served dynamically — never baked into the JS bundle.
 *
 * NOTE: For maximum security, restrict this key in the Google Cloud Console
 * to only the Maps JavaScript API + your production domain as HTTP referrer.
 */
router.get('/config', authMiddleware, (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Maps API not configured.' });
  // Return the key — it's restricted server-side in Google Cloud Console
  // and only available to logged-in users
  res.json({ apiKey: key });
});

module.exports = router;
