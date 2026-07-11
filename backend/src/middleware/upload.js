'use strict';

// Multer disk storage into storage/uploads/{uuid}/ with a strict
// extension + MIME whitelist and the configured size cap.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Keep only a safe basename: strip directories, collapse odd characters.
function sanitizeFilename(original) {
  const base = path.basename(original).replace(/[^\w.\- ]+/g, '_');
  return base.slice(-150) || 'file';
}

function createUpload(config) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      if (!req.uploadId) req.uploadId = randomUUID();
      const dir = path.join(config.uploadsDir, req.uploadId);
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename(req, file, cb) {
      cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`);
    },
  });

  function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = config.allowedMimeTypes[ext];
    if (!allowedMimes) {
      cb(badRequest(`File type "${ext || 'unknown'}" is not supported.`));
      return;
    }
    // Browsers report application/octet-stream for types they don't know.
    if (!allowedMimes.includes(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      cb(badRequest(`MIME type "${file.mimetype}" does not match a supported file type.`));
      return;
    }
    cb(null, true);
  }

  const fields = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: config.maxMergeFiles,
    },
  }).fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: config.maxMergeFiles },
  ]);

  // Wrap multer so its errors become clear JSON errors.
  return function upload(req, res, next) {
    fields(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          err = new Error(`File too large — the limit is ${config.maxFileSizeMb}MB.`);
          err.status = 413;
        } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          err = badRequest(
            `Too many files or unexpected field — send "file", or up to ${config.maxMergeFiles} "files" for merge.`,
          );
        } else {
          err.status = 400;
        }
      }
      next(err);
    });
  };
}

module.exports = { createUpload };
