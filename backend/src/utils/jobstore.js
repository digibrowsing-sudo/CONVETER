'use strict';

// Job metadata, stored as one JSON blob per job in Redis under ff:job:{id}.
//
// What is deliberately NOT in here (spec 6, 12.7): file contents, extracted
// text, raw IP addresses, and anything read out of a document. The finance
// metadata is limited to which bank format was detected and how many rows were
// parsed — never a transaction, a name, an account number or a balance.
//
// The record outlives the files by a grace period so that a status poll after
// expiry can answer JOB_EXPIRED instead of a bare 404.

const KEY_PREFIX = 'ff:job:';
const EXPIRY_GRACE_MS = 30 * 60 * 1000;

function createJobStore(redis, config) {
  const key = (jobId) => KEY_PREFIX + jobId;

  async function put(job) {
    const ttlMs = Math.max(60_000, new Date(job.expiresAt).getTime() + EXPIRY_GRACE_MS - Date.now());
    await redis.set(key(job.jobId), JSON.stringify(job), 'PX', Math.ceil(ttlMs));
    return job;
  }

  async function get(jobId) {
    const raw = await redis.get(key(jobId));
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * @param {object} fields  toolSlug, tier, ipHash, inputCount, inputBytes,
   *                         options, consentAt, files
   */
  async function create(jobId, fields) {
    const ttlMs = config.ttlMs[fields.tier] ?? config.ttlMs.S1;
    return put({
      jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      downloadCount: 0,
      ...fields,
    });
  }

  async function update(jobId, fields) {
    const job = await get(jobId);
    if (!job) return null;
    return put({ ...job, ...fields });
  }

  return {
    get,
    create,
    update,
    put,

    setProgress: (jobId, progress) =>
      update(jobId, { status: 'processing', progress, startedAt: new Date().toISOString() }),

    complete: (jobId, result) =>
      update(jobId, {
        status: 'completed',
        progress: 100,
        finishedAt: new Date().toISOString(),
        result,
      }),

    /**
     * @param {{code: string, message: string}} error
     * A failed job's files are dropped sooner than a successful one's — there
     * is nothing to download, so there is no reason to keep them (spec 10.2).
     */
    fail: (jobId, error) =>
      update(jobId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + config.ttlMs.failed).toISOString(),
        error,
      }),

    markPurged: (jobId) =>
      update(jobId, { status: 'expired', purgedAt: new Date().toISOString(), result: null }),

    recordDownload: async (jobId) => {
      const job = await get(jobId);
      if (!job) return null;
      return put({ ...job, downloadCount: (job.downloadCount || 0) + 1 });
    },
  };
}

module.exports = { createJobStore, KEY_PREFIX };
