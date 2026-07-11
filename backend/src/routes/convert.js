'use strict';

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const express = require('express');
const { createUpload } = require('../middleware/upload');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parseOptions(raw) {
  if (raw === undefined || raw === '') return {};
  let options;
  try {
    options = JSON.parse(raw);
  } catch {
    throw badRequest('"options" must be a valid JSON string.');
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw badRequest('"options" must be a JSON object.');
  }
  return options;
}

function createConvertRouter({ config, jobstore, queue, logger }) {
  const router = express.Router();
  const upload = createUpload(config);

  router.post('/', upload, async (req, res, next) => {
    try {
      const files = [...(req.files?.file ?? []), ...(req.files?.files ?? [])];
      if (files.length === 0) {
        throw badRequest('No file uploaded — send "file" (or "files" for merge).');
      }

      const tool = req.body.tool;
      if (!config.tools.includes(tool)) {
        throw badRequest(`Unknown tool — expected one of: ${config.tools.join(', ')}.`);
      }

      if (tool === 'merge-pdf' && files.length < 2) {
        throw badRequest('Merging needs at least 2 PDF files.');
      }
      if (tool !== 'merge-pdf' && files.length !== 1) {
        throw badRequest(`"${tool}" takes exactly one file.`);
      }

      const allowedExts = config.toolInputExtensions[tool];
      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExts.includes(ext)) {
          throw badRequest(
            `"${tool}" does not accept "${ext || 'unknown'}" files — expected: ${allowedExts.join(', ')}.`,
          );
        }
      }

      const options = parseOptions(req.body.options);

      let targetFormat;
      if (tool === 'image-convert') {
        targetFormat = String(req.body.targetFormat || '').toLowerCase();
        if (!config.imageTargetFormats.includes(targetFormat)) {
          throw badRequest(
            `"targetFormat" must be one of: ${config.imageTargetFormats.join(', ')}.`,
          );
        }
      }

      const jobId = randomUUID();
      const jobData = {
        jobId,
        tool,
        targetFormat,
        options,
        uploadDir: path.join(config.uploadsDir, req.uploadId),
        inputs: files.map((f) => ({
          path: f.path,
          originalName: f.originalname,
          size: f.size,
        })),
      };

      await jobstore.create(jobId, { tool });
      await queue.add(tool, jobData, { jobId });

      logger.info('job queued', { jobId, tool, files: files.length });
      res.status(202).json({ jobId });
    } catch (err) {
      // Validation failed after multer already stored the upload — remove it
      // now rather than waiting for the TTL sweep.
      if (req.uploadId) {
        const dir = path.join(config.uploadsDir, req.uploadId);
        fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
      next(err);
    }
  });

  return router;
}

module.exports = { createConvertRouter };
