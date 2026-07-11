'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createDownloadRouter({ config, jobstore }) {
  const router = express.Router();

  router.get('/:jobId', async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = UUID_RE.test(jobId) ? await jobstore.get(jobId) : null;
      if (!job || job.status !== 'completed' || !job.result?.outputPath) {
        res.status(404).json({ error: 'Job not found, not finished, or expired.' });
        return;
      }

      // Only ever serve files from the converted directory.
      const filePath = path.resolve(job.result.outputPath);
      const convertedRoot = path.resolve(config.convertedDir) + path.sep;
      if (!filePath.startsWith(convertedRoot)) {
        res.status(404).json({ error: 'Job not found, not finished, or expired.' });
        return;
      }

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        res.status(404).json({ error: 'This file has expired and was cleaned up.' });
        return;
      }

      res.download(filePath, job.result.outputName || path.basename(filePath));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createDownloadRouter };
