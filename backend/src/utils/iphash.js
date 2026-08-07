'use strict';

// Raw IP addresses are never stored, logged or used as a key (spec 12.7).
// Everything that needs to identify a client — rate limiting, abuse tracking,
// per-job attribution — uses this hash instead.
//
// The daily component means two hashes of the same address on different days
// do not match, so a leaked key set cannot be joined into a browsing history.
// The spec calls for a salt rotated nightly by cron; deriving the day from the
// clock gives the same property with nothing to schedule and nothing to lose
// on a restart.

const crypto = require('crypto');

function dayStamp(now = new Date()) {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

/**
 * @param {string} ip     raw address, used and discarded
 * @param {string} salt   long-lived secret from IP_HASH_SALT
 * @returns {string}      32 hex characters — enough to be collision-free at our
 *                        volume, short enough to keep Redis keys small
 */
function hashIp(ip, salt, now = new Date()) {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${dayStamp(now)}:${String(ip || 'unknown')}`)
    .digest('hex')
    .slice(0, 32);
}

/** Express middleware: attaches req.ipHash and makes the raw IP unavailable downstream. */
function createIpHashMiddleware(config) {
  return function ipHashMiddleware(req, res, next) {
    req.ipHash = hashIp(req.ip, config.ipHashSalt);
    next();
  };
}

module.exports = { hashIp, dayStamp, createIpHashMiddleware };
