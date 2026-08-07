'use strict';

// Multer streaming upload into storage/in/{jobId}/ (spec 10.1).
//
// Files are streamed to disk and never buffered in memory, and the size cap is
// the one belonging to the tool being requested rather than a single global
// number — so a Tier F job cannot smuggle in 25 MB against a 15 MB budget.
//
// To make that possible the client sends the tool slug in the query string as
// well as the body: the query is known before the multipart body is parsed, so
// multer can be built with the right limits and abort mid-upload rather than
// after the whole file has landed.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const registry = require('../tools/registry');
const { ApiError } = require('../errors');

/** Resolve the requested tool from the query string, falling back to the body. */
function resolveTool(req) {
  const slug = String(req.query.tool || req.body?.tool || '');
  return registry.get(slug);
}

/**
 * Spec 12.1 step 4. The client's filename is never used on disk: it is replaced
 * with `original.{ext}`, so path separators, NUL bytes and unicode RTL override
 * characters have nothing to act on. The display name is sanitised separately
 * and kept only to name the download.
 */
function safeDisplayName(originalName) {
  const base = path
    .basename(String(originalName || ''))
    // NUL and other C0 controls, then the unicode bidi overrides that let a
    // filename render as "gpj.exe" while actually ending in .exe.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .trim();
  return base.slice(0, 120) || 'file';
}

function safeExt(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

function createUpload(config) {
  return function upload(req, res, next) {
    const tool = resolveTool(req);
    if (!tool) {
      next(
        new ApiError(
          'BAD_REQUEST',
          'Unknown tool. Pass a valid tool slug in the "tool" query parameter.',
        ),
      );
      return;
    }
    if (!registry.isServerRunnable(tool)) {
      next(
        new ApiError(
          'BAD_REQUEST',
          `"${tool.name}" runs in your browser and does not accept server uploads.`,
        ),
      );
      return;
    }

    req.tool = tool;
    req.jobId = randomUUID();

    let index = 0;
    const storage = multer.diskStorage({
      destination(request, file, cb) {
        const dir = path.join(config.inDir, request.jobId);
        fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
      },
      filename(request, file, cb) {
        // Regenerated name — nothing from the client reaches the filesystem.
        const ext = safeExt(file.originalname);
        cb(null, `original-${index++}${ext}`);
      },
    });

    function fileFilter(request, file, cb) {
      const ext = safeExt(file.originalname);
      if (!tool.acceptExts.includes(ext)) {
        cb(
          new ApiError(
            'UNSUPPORTED_TYPE',
            `${tool.name} accepts ${tool.acceptExts.join(', ')} files.`,
          ),
        );
        return;
      }
      // The declared MIME type is recorded but never trusted; the magic-byte
      // check in uploadGuard is what actually decides (spec 12.1 step 2).
      cb(null, true);
    }

    const handler = multer({
      storage,
      fileFilter,
      limits: {
        fileSize: Math.min(tool.maxBytes, config.maxUploadBytes),
        files: tool.maxFiles,
        fields: 20,
        parts: tool.maxFiles + 20,
      },
    }).array('files', tool.maxFiles);

    handler(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      next(translateMulterError(err, tool, config));
    });
  };
}

function translateMulterError(err, tool, config) {
  if (!(err instanceof multer.MulterError)) return err;
  switch (err.code) {
    case 'LIMIT_FILE_SIZE': {
      const limitMb = Math.floor(Math.min(tool.maxBytes, config.maxUploadBytes) / (1024 * 1024));
      return new ApiError('FILE_TOO_LARGE', `${tool.name} accepts files up to ${limitMb} MB.`, {
        maxBytes: tool.maxBytes,
      });
    }
    case 'LIMIT_FILE_COUNT':
      return new ApiError('TOO_MANY_FILES', `${tool.name} accepts up to ${tool.maxFiles} files.`, {
        maxFiles: tool.maxFiles,
      });
    case 'LIMIT_UNEXPECTED_FILE':
      return new ApiError('BAD_REQUEST', 'Send the uploaded files in a field named "files".');
    default:
      return new ApiError('BAD_REQUEST', 'The upload could not be read. Please try again.');
  }
}

module.exports = { createUpload, safeDisplayName, safeExt };
