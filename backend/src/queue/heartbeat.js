'use strict';

// Worker liveness. Each worker refreshes a short-lived key; /v1/health reads
// it. A worker that has crashed, wedged or lost Redis stops refreshing and the
// health check goes red instead of quietly accepting jobs nobody will run.

const WORKER_HEARTBEAT_PREFIX = 'ff:worker:';
const HEARTBEAT_TTL_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 10_000;

function startHeartbeat(redis, queueName, logger) {
  const key = `${WORKER_HEARTBEAT_PREFIX}${queueName}`;

  async function beat() {
    try {
      await redis.set(key, new Date().toISOString(), 'EX', HEARTBEAT_TTL_SECONDS);
    } catch (err) {
      logger?.warn?.('heartbeat write failed', { queue: queueName, error: err.message });
    }
  }

  void beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  timer.unref();

  return async function stop() {
    clearInterval(timer);
    await redis.del(key).catch(() => {});
  };
}

module.exports = {
  startHeartbeat,
  WORKER_HEARTBEAT_PREFIX,
  HEARTBEAT_TTL_SECONDS,
  HEARTBEAT_INTERVAL_MS,
};
