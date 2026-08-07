'use strict';

// GET /v1/jobs/:id/download?t=<signed> (spec 7.3).
//
// Always served as an attachment with nosniff, never inline: a converted file
// is attacker-influenced content, and rendering it in our own origin is how a
// crafted SVG or HTML output turns into stored XSS (spec 12.6).

const path = require('path');
const fs = require('fs');
const express = require('express');

const { verifyToken } = require('../utils/downloadToken');
const { purgeJobFiles, UUID_RE } = require('../utils/purge');
const { ApiError } = require('../errors');

function createDownloadRouter({ config, logger, jobstore }) {
  const router = express.Router();

  router.get('/:jobId/download', async (req, res, next) => {
    try {
      const { jobId } = req.params;
      if (!UUID_RE.test(jobId)) throw new ApiError('NOT_FOUND', 'No such job.');

      const check = verifyToken(req.query.t, jobId, config.downloadSigningSecret);
      if (!check.valid) {
        throw check.reason === 'expired'
          ? new ApiError('JOB_EXPIRED', 'This download link has expired. Please convert the file again.')
          : new ApiError('INVALID_TOKEN', 'This download link is not valid.');
      }

      const job = await jobstore.get(jobId);
      if (!job || job.status === 'expired') {
        throw new ApiError('JOB_EXPIRED', 'This file has expired and was deleted.');
      }
      if (job.status !== 'completed' || !job.result?.outputPath) {
        throw new ApiError('NOT_FOUND', 'This job has not finished yet.');
      }

      // Only ever serve from inside the output directory, whatever the job
      // record claims.
      const filePath = path.resolve(job.result.outputPath);
      const outRoot = path.resolve(config.outDir) + path.sep;
      if (!filePath.startsWith(outRoot)) {
        logger.error('download blocked: path outside the output root', { jobId });
        throw new ApiError('NOT_FOUND', 'This file is no longer available.');
      }

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        throw new ApiError('JOB_EXPIRED', 'This file has expired and was deleted.');
      }

      const filename = job.result.outputName || path.basename(filePath);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store, private');
      res.download(filePath, filename, async (err) => {
        if (err) {
          if (!res.headersSent) next(err);
          return;
        }
        await jobstore.recordDownload(jobId).catch(() => {});

        // Spec 10.2: a finance document is deleted the instant it is
        // delivered, rather than waiting out even its 15-minute TTL.
        if (job.tier === 'F') {
          try {
            await purgeJobFiles(config, jobId);
            await jobstore.markPurged(jobId);
            logger.info('finance job purged on download', { jobId, toolSlug: job.toolSlug });
          } catch (purgeErr) {
            logger.error('finance purge-on-download failed', {
              jobId,
              error: purgeErr.message,
            });
          }
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createDownloadRouter };
