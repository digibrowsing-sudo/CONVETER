'use strict';

// Two queues, not one (spec 8.3).
//
// A finance job is the one people would pay for, and it must never wait behind
// a 90-second PowerPoint render. Each queue runs at concurrency 1 because the
// box has 2 vCPU shared with services that belong to a paying client.

const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { NON_RETRYABLE_CODES } = require('../errors');

// maxRetriesPerRequest must be null for BullMQ workers; harmless for queues.
function createRedisConnection(config) {
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
}

/** Finance work goes to its own queue; everything server-side goes to doc. */
function queueNameForTier(tier) {
  return tier === 'F' ? 'finance' : 'doc';
}

function createQueues(config, connection) {
  const queues = {};
  for (const [name, settings] of Object.entries(config.queues)) {
    queues[name] = new Queue(settings.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 3600, count: 500 },
      },
    });
  }
  return queues;
}

/** Per-tier attempts and backoff (spec 8.2). */
function jobOptionsForTier(config, tier, jobId) {
  const policy = config.retry[tier] || config.retry.S1;
  return {
    jobId,
    attempts: policy.attempts,
    backoff: { type: 'exponential', delay: policy.backoffMs },
  };
}

/**
 * Rough wait estimate for the 201 response. Deliberately pessimistic — a job
 * that finishes sooner than promised is a good surprise.
 */
const TIER_SECONDS = { S1: 6, S2: 25, F: 20 };

function estimateSeconds(tier, queuePosition) {
  const perJob = TIER_SECONDS[tier] || 15;
  return perJob * Math.max(1, queuePosition + 1);
}

module.exports = {
  createRedisConnection,
  createQueues,
  queueNameForTier,
  jobOptionsForTier,
  estimateSeconds,
  NON_RETRYABLE_CODES,
};
