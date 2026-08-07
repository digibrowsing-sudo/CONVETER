'use strict';

// The upload validation chain (spec 12.1). Every step must pass before a file
// is allowed anywhere near a conversion engine.
//
//   1. extension allowlist        — in upload.js fileFilter, from the registry
//   2. magic-byte sniffing        — here; the declared MIME type is ignored
//   3. size cap                   — in upload.js, streamed, per-tool, mid-upload
//   4. filename regeneration      — in upload.js, `original-N.ext`
//   5. archive-bomb guard         — here, for every zip container
//   6. PDF structure check        — here, pdfinfo must accept the file
//   7. page/entity limits         — here

const { identify } = require('../security/magic');
const { checkZipBomb } = require('../security/zip');
const { checkPdf, PdfCheckError } = require('../security/pdfcheck');
const { ApiError } = require('../errors');
const { safeDisplayName, safeExt } = require('./upload');

// Container formats that are a zip underneath and therefore need the bomb guard.
const ZIP_CONTAINERS = new Set([
  'ooxml-word',
  'ooxml-excel',
  'ooxml-powerpoint',
  'odf-text',
  'odf-spreadsheet',
  'odf-presentation',
]);

function unsupported(tool) {
  return new ApiError(
    'UNSUPPORTED_TYPE',
    `This file is not a valid ${tool.acceptExts.join(' / ')} document. ` +
      'Its contents do not match its extension.',
  );
}

/**
 * Express middleware. Runs after multer, before the job is enqueued.
 * On success it attaches `req.validatedFiles` — the only file list any
 * downstream code should use.
 */
function createUploadGuard({ config, logger }) {
  return async function uploadGuard(req, res, next) {
    try {
      const tool = req.tool;
      const files = req.files || [];

      if (files.length === 0) {
        throw new ApiError('BAD_REQUEST', 'No file was uploaded.');
      }
      if (files.length > tool.maxFiles) {
        throw new ApiError('TOO_MANY_FILES', `${tool.name} accepts up to ${tool.maxFiles} files.`);
      }
      if (tool.slug === 'merge-pdf' && files.length < 2) {
        throw new ApiError('BAD_REQUEST', 'Merging needs at least two PDF files.');
      }

      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > tool.maxBytes) {
        throw new ApiError(
          'FILE_TOO_LARGE',
          `${tool.name} accepts up to ${Math.floor(tool.maxBytes / (1024 * 1024))} MB in total.`,
          { maxBytes: tool.maxBytes },
        );
      }

      const validated = [];
      for (const file of files) {
        const ext = safeExt(file.originalname);
        const identified = await identify(file.path, ext);

        if (identified.format === 'unknown' || identified.format === 'zip-unreadable') {
          throw unsupported(tool);
        }
        // Step 2: the bytes decide. A .docx that is really a PDF is rejected
        // here even though its extension was on the allowlist.
        if (!identified.matchesExtension) throw unsupported(tool);

        if (ZIP_CONTAINERS.has(identified.format) && identified.zip) {
          const bomb = checkZipBomb(identified.zip, {
            ratio: config.validation.zipBombRatio,
            maxUncompressedBytes: config.validation.zipBombMaxUncompressedBytes,
          });
          if (bomb) {
            logger.warn('archive bomb guard rejected an upload', {
              jobId: req.jobId,
              toolSlug: tool.slug,
              reason: bomb.reason,
            });
            throw new ApiError(
              'UNSUPPORTED_TYPE',
              'This document could not be accepted because its internal structure looks unsafe.',
            );
          }
        }

        let pages = null;
        if (identified.format === 'pdf') {
          const result = await checkPdf(file.path, {
            maxPages: config.validation.maxPdfPages,
            requireExternal: config.env === 'production',
            logger,
          });
          pages = result.pages;
        }

        validated.push({
          path: file.path,
          // Kept only to name the download; never logged, never persisted
          // beyond the job's own TTL (spec 12.7, 13.1).
          displayName: safeDisplayName(file.originalname),
          ext,
          format: identified.format,
          size: file.size,
          pages,
        });
      }

      req.validatedFiles = validated;
      next();
    } catch (err) {
      if (err instanceof PdfCheckError) {
        next(new ApiError(err.code, err.message));
        return;
      }
      next(err);
    }
  };
}

module.exports = { createUploadGuard, ZIP_CONTAINERS };
