/**
 * Fare Token Utility — HMAC-SHA256 signed fare quote
 * 
 * Used by:
 *   - fareController.js (signs the quote)
 *   - rideController.js (verifies the token when booking)
 *
 * Prevents circular dependency between the two controllers.
 */
const crypto = require('crypto');

const TOKEN_TTL_SECS = 5 * 60; // fare tokens expire after 5 minutes

function getSecret() {
  const secret = process.env.FARE_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('FARE_HMAC_SECRET / JWT_SECRET not configured');
  return secret;
}

/**
 * Sign a fare payload with HMAC-SHA256.
 * Returns a compact base64url token the frontend must echo back when booking.
 */
function signFareQuote(payload) {
  const secret = getSecret();
  const data   = JSON.stringify(payload);
  const sig    = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url');
}

/**
 * Verify and decode a fare token received from the frontend.
 * Returns the verified payload or throws an Error.
 */
function verifyFareToken(token) {
  const secret = getSecret();
  let payload;
  try {
    payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid fare token format.');
  }

  const { sig, ...data } = payload;
  if (!sig) throw new Error('Fare token is missing signature.');

  const sigBuf      = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(
    crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex'),
    'hex'
  );

  if (sigBuf.length !== expectedBuf.length) throw new Error('Fare token signature is invalid.');
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Fare token signature is invalid.');
  }

  if (Date.now() / 1000 > data.exp) {
    throw new Error('Fare quote has expired. Please recalculate the fare.');
  }

  return data;
}

module.exports = { signFareQuote, verifyFareToken, TOKEN_TTL_SECS };
