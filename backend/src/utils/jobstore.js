'use strict';

// Job metadata store backed by Redis. One JSON blob per job under
// fileforge:job:{id}, expiring at twice the file TTL so status queries
// outlive the files slightly but never accumulate forever.

const KEY_PREFIX = 'fileforge:job:';

function createJobStore(redis, config) {
  const ttlSeconds = config.fileTtlMinutes * 60 * 2;
  const key = (jobId) => KEY_PREFIX + jobId;

  async function set(jobId, job) {
    await redis.set(key(jobId), JSON.stringify(job), 'EX', ttlSeconds);
  }

  async function get(jobId) {
    const raw = await redis.get(key(jobId));
    return raw ? JSON.parse(raw) : null;
  }

  async function create(jobId, fields) {
    await set(jobId, {
      jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      ...fields,
    });
  }

  async function update(jobId, fields) {
    const job = (await get(jobId)) || { jobId };
    await set(jobId, { ...job, ...fields });
  }

  return {
    create,
    get,
    update,
    setProgress: (jobId, progress) => update(jobId, { status: 'processing', progress }),
    complete: (jobId, result) =>
      update(jobId, { status: 'completed', progress: 100, result }),
    fail: (jobId, message) =>
      update(jobId, { status: 'failed', error: message }),
  };
}

module.exports = { createJobStore };
