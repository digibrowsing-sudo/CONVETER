'use strict';

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// maxRetriesPerRequest must be null for BullMQ workers; harmless for queues.
function createRedisConnection(config) {
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
}

function createQueue(config, connection) {
  return new Queue(config.queueName, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 3600 },
    },
  });
}

module.exports = { createRedisConnection, createQueue };
