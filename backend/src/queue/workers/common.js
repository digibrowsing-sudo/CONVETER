'use strict';

// Helpers shared by every conversion processor.

const fs = require('fs');
const path = require('path');
const { ApiError } = require('../../errors');

// Progress checkpoints reported to the job store.
const PROGRESS = { RECEIVED: 10, CONVERTING: 45, PACKAGING: 85, DONE: 100 };

/**
 * Throw this from a processor when the failure has a user-facing explanation.
 * The code decides both the HTTP status the poll returns and whether BullMQ
 * bothers retrying (spec 8.2).
 */
function conversionError(code, message, extra) {
  return new ApiError(code, message, extra);
}

/** Translate an exec.run rejection into the right user-facing error. */
function fromEngineFailure(err, { timeoutMessage, failureMessage }) {
  if (err.timedOut) return conversionError('TIMEOUT', timeoutMessage);
  return conversionError('CONVERSION_FAILED', failureMessage);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

const outDirFor = (config, jobId) => ensureDir(path.join(config.outDir, jobId));
const tmpDirFor = (config, jobId) => ensureDir(path.join(config.tmpDir, jobId));

/** "report.docx" -> "report.pdf", "report-compressed.pdf" */
function renameExt(displayName, newExt, suffix = '') {
  const base = path.basename(displayName, path.extname(displayName));
  return `${base}${suffix}${newExt}`;
}

async function fileSize(filePath) {
  const stat = await fs.promises.stat(filePath);
  return stat.size;
}

/** Assert an engine actually produced output rather than exiting 0 silently. */
async function requireOutput(filePath, message) {
  try {
    const size = await fileSize(filePath);
    if (size > 0) return size;
  } catch {
    // fall through
  }
  throw conversionError('CONVERSION_FAILED', message);
}

module.exports = {
  PROGRESS,
  conversionError,
  fromEngineFailure,
  ensureDir,
  outDirFor,
  tmpDirFor,
  renameExt,
  fileSize,
  requireOutput,
};
