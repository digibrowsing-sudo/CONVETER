'use strict';

// GET /v1/health (spec 7.5). Coolify gates a deployment on this, so it has to
// be honest: if a worker is not consuming its queue, the answer is not "ok".

const express = require('express');
const { WORKER_HEARTBEAT_PREFIX, HEARTBEAT_TTL_SECONDS } = require('../queue/heartbeat');

const { version } = require('../../package.json');

function createHealthRouter({ config, redis, queues }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const workers = {};
    let queueDepth = 0;
    let ok = true;

    try {
      for (const name of Object.keys(queues)) {
        queueDepth += await queues[name].getWaitingCount();
        const beat = await redis.get(`${WORKER_HEARTBEAT_PREFIX}${name}`);
        workers[name] = beat ? 'up' : 'down';
        if (!beat) ok = false;
      }
    } catch (err) {
      res.status(503).json({
        ok: false,
        version,
        error: 'redis unavailable',
        workers,
        queueDepth: null,
      });
      return;
    }

    if (queueDepth > config.queueDepthLimit) ok = false;

    res.status(ok ? 200 : 503).json({
      ok,
      version,
      queueDepth,
      queueDepthLimit: config.queueDepthLimit,
      workers,
      heartbeatTtlSeconds: HEARTBEAT_TTL_SECONDS,
    });
  });

  return router;
}

module.exports = { createHealthRouter };
