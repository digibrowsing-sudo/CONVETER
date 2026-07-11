'use strict';

const express = require('express');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createStatusRouter({ jobstore }) {
  const router = express.Router();

  router.get('/:jobId', async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = UUID_RE.test(jobId) ? await jobstore.get(jobId) : null;
      if (!job) {
        res.status(404).json({ error: 'Job not found or expired.' });
        return;
      }
      res.json({
        status: job.status,
        progress: job.progress ?? 0,
        ...(job.error ? { error: job.error } : {}),
        downloadReady: job.status === 'completed',
        ...(job.result
          ? {
              result: {
                outputName: job.result.outputName,
                size: job.result.size,
                ...(job.result.originalSize !== undefined
                  ? { originalSize: job.result.originalSize }
                  : {}),
              },
            }
          : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createStatusRouter };
