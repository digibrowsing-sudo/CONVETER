'use strict';

const rateLimit = require('express-rate-limit');

function createRateLimiter(config) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests — try again in a few minutes.' });
    },
  });
}

module.exports = { createRateLimiter };
