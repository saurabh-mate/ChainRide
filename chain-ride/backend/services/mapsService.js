/**
 * Maps Service — Google Directions API wrapper
 * Provides route calculation from driver location to passenger pickup
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Get route between two points using Google Directions API
 * @param {number} driverLat
 * @param {number} driverLng
 * @param {number} pickupLat
 * @param {number} pickupLng
 * @returns {Promise<{polyline: string, distance: number, duration: number}>}
 */
exports.getRoute = async (driverLat, driverLng, pickupLat, pickupLng) => {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured');
  }

  const origin = `${driverLat},${driverLng}`;
  const destination = `${pickupLat},${pickupLng}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK') {
    throw new Error(data.status === 'ZERO_RESULTS'
      ? 'No route found between driver and pickup'
      : `Directions API error: ${data.status}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    polyline: route.overview_polyline.points,
    distance: leg.distance.value / 1000, // km
    duration: Math.ceil(leg.duration.value / 60), // minutes
  };
};

/**
 * Decode Google encoded polyline string to array of {lat, lng} points
 * @param {string} encoded
 * @returns {{lat: number, lng: number}[]}
 */
exports.decodePolyline = (encoded) => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
};
