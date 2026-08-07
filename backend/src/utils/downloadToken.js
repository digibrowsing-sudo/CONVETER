'use strict';

// Signed download tokens (spec 7.3).
//
// Job IDs are UUIDv4 and therefore already unguessable, but the token means a
// download URL cannot be replayed indefinitely and cannot be constructed at all
// without the server secret. It also carries its own expiry, so a link pasted
// into a chat thread stops working even before the file is reaped.

const crypto = require('crypto');

const SEPARATOR = '.';

function sign(jobId, expiresAtMs, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${jobId}:${expiresAtMs}`)
    .digest('base64url');
}

/** @returns {string} token of the form `<expiryMs>.<signature>` */
function createToken(jobId, secret, ttlMs) {
  const expiresAtMs = Date.now() + ttlMs;
  return `${expiresAtMs}${SEPARATOR}${sign(jobId, expiresAtMs, secret)}`;
}

/**
 * @returns {{valid: true}|{valid: false, reason: 'malformed'|'expired'|'bad-signature'}}
 */
function verifyToken(token, jobId, secret) {
  const parts = String(token || '').split(SEPARATOR);
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const expiresAtMs = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(expiresAtMs)) return { valid: false, reason: 'malformed' };

  const expected = Buffer.from(sign(jobId, expiresAtMs, secret));
  const actual = Buffer.from(parts[1]);
  // Compare before checking expiry, and with a length guard, so the comparison
  // stays constant-time and leaks nothing about the correct signature.
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { valid: false, reason: 'bad-signature' };
  }
  if (expiresAtMs < Date.now()) return { valid: false, reason: 'expired' };

  return { valid: true };
}

module.exports = { createToken, verifyToken };
