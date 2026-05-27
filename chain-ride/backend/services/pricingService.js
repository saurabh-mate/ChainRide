/**
 * Dynamic Fare Service
 *
 * Formula:
 *   fare = (baseFare + distanceCost + timeCost) × surgeMultiplier + platformFee
 *
 * Surge pricing:
 *   demandRatio = activeRideRequests / availableDrivers
 *   ratio <= 1.0  → surge = 1.0
 *   ratio <= 1.5  → surge = 1.2
 *   ratio <= 2.0  → surge = 1.5
 *   ratio >  2.0  → surge = 2.0 (capped)
 */

const MINIMUM_FARE  = 50;
const MAX_SURGE     = 2.0;

// Vehicle-based pricing config
const vehiclePricing = {
  bike: {
    baseFare: 20,
    perKm: 8,
    perMin: 1,
    platformFee: 5,
    minimumFare: 40,
  },
  auto: {
    baseFare: 25,
    perKm: 10,
    perMin: 1.5,
    platformFee: 8,
    minimumFare: 50,
  },
  mini: {
    baseFare: 30,
    perKm: 9,
    perMin: 2,
    platformFee: 10,
    minimumFare: 60,
  },
  sedan: {
    baseFare: 50,
    perKm: 12,
    perMin: 3,
    platformFee: 15,
    minimumFare: 80,
  },
  suv: {
    baseFare: 80,
    perKm: 12,
    perMin: 4,
    platformFee: 20,
    minimumFare: 120,
  },
};

const VALID_VEHICLE_TYPES = Object.keys(vehiclePricing);
const DEFAULT_VEHICLE_TYPE = 'mini';

/**
 * Calculate the surge multiplier based on demand vs supply.
 * @param {number} rideRequests  - active ride requests count
 * @param {number} drivers       - available drivers count
 * @returns {number} surge multiplier (1.0 to 2.0)
 */
function calculateSurge(rideRequests, drivers) {
  if (drivers <= 0) return MAX_SURGE;          // cap at max when no drivers
  const ratio = rideRequests / drivers;
  if (ratio <= 1.0) return 1.0;
  if (ratio <= 1.5) return 1.2;
  if (ratio <= 2.0) return 1.5;
  return MAX_SURGE;
}

/**
 * Full fare breakdown calculation with vehicle-type support.
 * @param {number} distanceKm   - distance in kilometres
 * @param {number} durationMins - duration in minutes
 * @param {number} rideRequests - active ride request count (for surge)
 * @param {number} drivers      - available drivers count (for surge)
 * @param {string} vehicleType  - vehicle type (bike, auto, mini, sedan, suv)
 * @returns {{ baseFare, distanceCost, timeCost, surgeMultiplier, platformFee, totalFare } | { error: string }}
 */
exports.calculateFare = (distanceKm, durationMins, rideRequests = 0, drivers = 0, vehicleType = DEFAULT_VEHICLE_TYPE) => {
  // Validate inputs
  if (typeof distanceKm !== 'number' || distanceKm < 0 || Number.isNaN(distanceKm)) {
    return { error: 'Invalid distance value' };
  }
  if (typeof durationMins !== 'number' || durationMins < 0 || Number.isNaN(durationMins)) {
    return { error: 'Invalid duration value' };
  }

  // Resolve vehicle type (safe default)
  const vType = VALID_VEHICLE_TYPES.includes(vehicleType) ? vehicleType : DEFAULT_VEHICLE_TYPE;
  const pricing = vehiclePricing[vType];

  const surgeMultiplier = calculateSurge(rideRequests, drivers);
  const baseFare        = pricing.baseFare;
  const distanceCost    = parseFloat((distanceKm * pricing.perKm).toFixed(2));
  const timeCost        = parseFloat((durationMins * pricing.perMin).toFixed(2));

  let totalFare = (baseFare + distanceCost + timeCost) * surgeMultiplier + pricing.platformFee;
  totalFare    = parseFloat(Math.max(totalFare, pricing.minimumFare).toFixed(2));

  return {
    vehicleType: vType,
    baseFare,
    distanceCost,
    timeCost,
    surgeMultiplier,
    platformFee: pricing.platformFee,
    minimumFare: pricing.minimumFare,
    totalFare,
  };
};

/**
 * Simple fare calculation with just distance & time (no surge context).
 * Maintains backward compatibility with existing callers.
 * @param {number} distanceKm
 * @param {number} durationMins
 * @param {number} surgeMultiplier
 * @param {string} vehicleType
 * @returns {number} total fare
 */
exports.calculateSimpleFare = (distanceKm, durationMins, surgeMultiplier = 1.0, vehicleType = DEFAULT_VEHICLE_TYPE) => {
  const result = exports.calculateFare(distanceKm, durationMins, 0, 1, vehicleType);
  return Math.round(result.totalFare);
};

// Export vehicle config for external use
exports.vehiclePricing = vehiclePricing;
exports.VALID_VEHICLE_TYPES = VALID_VEHICLE_TYPES;
exports.DEFAULT_VEHICLE_TYPE = DEFAULT_VEHICLE_TYPE;
