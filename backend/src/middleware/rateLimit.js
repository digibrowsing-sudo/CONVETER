'use strict';

// Redis-backed tiered rate limiting (spec 12.5).
//
// Tier C tools are absent on purpose: they run in the user's browser and cost
// us nothing, so limiting them would only make the product worse.
//
// The shape is plan-aware (spec 16.5) so that adding a paid tier later is a
// config change rather than a rewrite. Today every request resolves to 'free'.

const { ApiError } = require('../errors');
const registry = require('../tools/registry');

const KEY_PREFIX = 'ff:rl:';

/**
 * Fixed-window counter. The window index is part of the key, so expiry is
 * handled by Redis and there is no sweep to run.
 *
 * @returns {Promise<{allowed: boolean, used: number, retryAfterSeconds: number}>}
 */
async function consume(redis, scope, id, { max, windowMs }, amount = 1) {
  const window = Math.floor(Date.now() / windowMs);
  const key = `${KEY_PREFIX}${scope}:${id}:${window}`;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  const [used] = await redis
    .multi()
    .incrby(key, amount)
    .expire(key, ttlSeconds, 'NX')
    .exec()
    .then((replies) => replies.map(([, value]) => value));

  const windowEndsAt = (window + 1) * windowMs;
  return {
    allowed: used <= max,
    used,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - Date.now()) / 1000)),
  };
}

/** Read a counter without incrementing it — used to check byte budgets up front. */
async function peek(redis, scope, id, { windowMs }) {
  const window = Math.floor(Date.now() / windowMs);
  const value = await redis.get(`${KEY_PREFIX}${scope}:${id}:${window}`);
  return Number.parseInt(value, 10) || 0;
}

function limited(message, retryAfterSeconds) {
  return new ApiError('RATE_LIMITED', message, { retryAfterSeconds });
}

function createRateLimiter({ config, redis, logger }) {
  /**
   * Called before the upload is read. Charges the job counters so that an
   * abusive client is stopped before it can stream 25 MB at us.
   */
  async function checkJobLimits(req) {
    const plan = req.plan || 'free';
    const limits = config.rateLimits[plan];
    const id = req.ipHash;
    const tool = registry.get(String(req.query.tool || ''));
    const isFinance = tool?.tier === 'F';

    const burst = await consume(redis, 'burst', id, limits.burst);
    if (!burst.allowed) {
      throw limited('You are going a little fast. Wait a few seconds and try again.', burst.retryAfterSeconds);
    }

    if (isFinance) {
      const hourly = await consume(redis, 'fin:h', id, limits.financeHourly);
      if (!hourly.allowed) {
        throw limited(
          `Finance conversions are limited to ${limits.financeHourly.max} per hour while the tool is free.`,
          hourly.retryAfterSeconds,
        );
      }
      const daily = await consume(redis, 'fin:d', id, limits.financeDaily);
      if (!daily.allowed) {
        throw limited(
          `Finance conversions are limited to ${limits.financeDaily.max} per day while the tool is free.`,
          daily.retryAfterSeconds,
        );
      }
    }

    const hourly = await consume(redis, 'srv:h', id, limits.serverHourly);
    if (!hourly.allowed) {
      throw limited(
        `Server-side conversions are limited to ${limits.serverHourly.max} per hour. Browser-based tools such as Merge and Split have no limit.`,
        hourly.retryAfterSeconds,
      );
    }
    const daily = await consume(redis, 'srv:d', id, limits.serverDaily);
    if (!daily.allowed) {
      throw limited(
        `Server-side conversions are limited to ${limits.serverDaily.max} per day. Browser-based tools have no limit.`,
        daily.retryAfterSeconds,
      );
    }
  }

  /**
   * Charged after the upload lands, when the real byte count is known.
   * Checked first so a single huge file cannot blow past the budget by itself.
   */
  async function checkByteBudget(req, bytes) {
    const limits = config.rateLimits[req.plan || 'free'];
    const alreadyUsed = await peek(redis, 'bytes:d', req.ipHash, limits.bytesDaily);
    if (alreadyUsed + bytes > limits.bytesDaily.max) {
      const budgetMb = Math.floor(limits.bytesDaily.max / (1024 * 1024));
      throw limited(`You have reached the ${budgetMb} MB daily upload budget. It resets every 24 hours.`, 3600);
    }
    await consume(redis, 'bytes:d', req.ipHash, limits.bytesDaily, bytes);
  }

  /**
   * Backpressure (spec 8.3). Saying "busy, try in a minute" is a far better
   * outcome than letting the box fall over and taking the other services with it.
   */
  async function checkQueueDepth(queues) {
    const depths = await Promise.all(Object.values(queues).map((queue) => queue.getWaitingCount()));
    const depth = depths.reduce((sum, value) => sum + value, 0);
    if (depth > config.queueDepthLimit) {
      logger.warn('rejecting job: queue is full', { depth, limit: config.queueDepthLimit });
      throw new ApiError(
        'QUEUE_FULL',
        'We are busy converting other files right now. Please try again in a minute.',
        { retryAfterSeconds: 60 },
      );
    }
    return depth;
  }

  /** Express middleware wrapper around checkJobLimits. */
  function middleware(req, res, next) {
    checkJobLimits(req).then(
      () => next(),
      (err) => next(err),
    );
  }

  return { checkJobLimits, checkByteBudget, checkQueueDepth, middleware };
}

module.exports = { createRateLimiter, consume, peek };
