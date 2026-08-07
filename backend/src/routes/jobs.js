'use strict';

// POST /v1/jobs, GET /v1/jobs/:id, DELETE /v1/jobs/:id (spec 7.1, 7.2, 7.4).

const express = require('express');
const { createUpload } = require('../middleware/upload');
const { createUploadGuard } = require('../middleware/uploadGuard');
const { validateOptions, requireConsent } = require('../validation/options');
const { createToken } = require('../utils/downloadToken');
const { purgeJobFiles, UUID_RE } = require('../utils/purge');
const { queueNameForTier, jobOptionsForTier, estimateSeconds } = require('../queue/producers');
const registry = require('../tools/registry');
const { ApiError } = require('../errors');

const IDEMPOTENCY_PREFIX = 'ff:idem:';

/** Public shape of a job, shared by the 201 and the status poll. */
function present(job, config) {
  const base = {
    jobId: job.jobId,
    tool: job.toolSlug,
    status: job.status,
    progress: job.progress ?? 0,
    expiresAt: job.expiresAt,
  };

  if (job.status === 'completed' && job.result) {
    return {
      ...base,
      download: {
        url: `/api/v1/jobs/${job.jobId}/download?t=${createToken(
          job.jobId,
          config.downloadSigningSecret,
          config.downloadTokenTtlMs,
        )}`,
        filename: job.result.outputName,
        bytes: job.result.size,
        expiresAt: job.expiresAt,
      },
      ...(job.result.warnings?.length ? { warnings: job.result.warnings } : {}),
      ...(job.result.meta ? { meta: job.result.meta } : {}),
      ...(job.result.originalSize !== undefined
        ? { originalBytes: job.result.originalSize }
        : {}),
      // Finance output is deleted the moment it is downloaded (spec 10.2), so
      // the UI has to say that before the user clicks.
      singleUse: job.tier === 'F',
    };
  }

  if (job.status === 'failed') {
    return { ...base, error: job.error };
  }
  if (job.status === 'expired') {
    return { ...base, error: { code: 'JOB_EXPIRED', message: 'This file has expired and was deleted.' } };
  }
  return base;
}

function createJobsRouter({ config, logger, jobstore, queues, redis, rateLimiter }) {
  const router = express.Router();
  const upload = createUpload(config);
  const uploadGuard = createUploadGuard({ config, logger });

  /** Spec 8.4 — a double-clicked button must not cost twice the CPU. */
  async function lookupIdempotent(req) {
    const providedKey = req.get('Idempotency-Key');
    if (!providedKey || !UUID_RE.test(providedKey)) return null;
    const key = `${IDEMPOTENCY_PREFIX}${req.ipHash}:${providedKey}`;
    const existingJobId = await redis.get(key);
    return { key, existingJobId };
  }

  router.post(
    '/',
    (req, res, next) => rateLimiter.middleware(req, res, next),
    upload,
    uploadGuard,
    async (req, res, next) => {
      const tool = req.tool;
      const jobId = req.jobId;
      let enqueued = false;

      try {
        const idem = await lookupIdempotent(req);
        if (idem?.existingJobId) {
          const existing = await jobstore.get(idem.existingJobId);
          if (existing) {
            await purgeJobFiles(config, jobId); // the duplicate upload is not needed
            res.status(200).json(present(existing, config));
            return;
          }
        }

        const options = validateOptions(tool, req.body.options);
        const consentAt = requireConsent(tool, req.body.consent);

        const inputBytes = req.validatedFiles.reduce((sum, file) => sum + file.size, 0);
        await rateLimiter.checkByteBudget(req, inputBytes);
        const queueDepth = await rateLimiter.checkQueueDepth(queues);

        const tier = registry.effectiveTier(tool);
        const queueName = queueNameForTier(tier);

        const job = await jobstore.create(jobId, {
          toolSlug: tool.slug,
          tier,
          ipHash: req.ipHash,
          inputCount: req.validatedFiles.length,
          inputBytes,
          options,
          ...(consentAt ? { consentAt } : {}),
          files: req.validatedFiles.map((file) => ({
            path: file.path,
            displayName: file.displayName,
            ext: file.ext,
            format: file.format,
            size: file.size,
            pages: file.pages,
          })),
        });

        await queues[queueName].add(
          tool.slug,
          { jobId, toolSlug: tool.slug, tier },
          jobOptionsForTier(config, tier, jobId),
        );
        enqueued = true;

        if (idem) {
          await redis.set(idem.key, jobId, 'PX', config.idempotencyTtlMs);
        }

        // Never log the filename, the raw IP or anything from the document (spec 13.1).
        logger.info('job queued', {
          jobId,
          toolSlug: tool.slug,
          tier,
          inputCount: req.validatedFiles.length,
          inputBytes,
          queueDepth,
        });

        res.status(201).json({
          ...present(job, config),
          queuePosition: queueDepth,
          estimatedSeconds: estimateSeconds(tier, queueDepth),
        });
      } catch (err) {
        // Validation failed after the upload already landed: remove it now
        // rather than leaving it for the reaper.
        if (!enqueued) await purgeJobFiles(config, jobId).catch(() => {});
        next(err);
      }
    },
  );

  router.get('/:jobId', async (req, res, next) => {
    try {
      const job = await getJobOr404(jobstore, req.params.jobId);
      res.json(present(job, config));
    } catch (err) {
      next(err);
    }
  });

  // Spec 7.4 — user-initiated immediate purge. This is a trust feature as much
  // as a compliance one, and the UI surfaces it as a visible button.
  router.delete('/:jobId', async (req, res, next) => {
    try {
      const job = await getJobOr404(jobstore, req.params.jobId);
      await purgeJobFiles(config, job.jobId);
      await jobstore.markPurged(job.jobId);
      logger.info('job purged on user request', { jobId: job.jobId, toolSlug: job.toolSlug });
      res.status(200).json({ jobId: job.jobId, status: 'deleted' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

async function getJobOr404(jobstore, jobId) {
  if (!UUID_RE.test(jobId)) {
    throw new ApiError('NOT_FOUND', 'No such job.');
  }
  const job = await jobstore.get(jobId);
  if (!job) {
    throw new ApiError('JOB_EXPIRED', 'This job has expired and its files were deleted.');
  }
  return job;
}

module.exports = { createJobsRouter, present, getJobOr404 };
