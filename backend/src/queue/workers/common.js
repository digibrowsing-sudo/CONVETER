'use strict';

// Small helpers shared by all conversion workers.

const fs = require('fs');
const path = require('path');

// Progress checkpoints reported to the job store.
const PROGRESS = { RECEIVED: 10, CONVERTING: 50, DONE: 100 };

// A user-facing error: its message is safe to show in the UI.
class ConversionError extends Error {
  constructor(message) {
    super(message);
    this.userMessage = message;
  }
}

async function ensureOutDir(config, jobId) {
  const outDir = path.join(config.convertedDir, jobId);
  await fs.promises.mkdir(outDir, { recursive: true });
  return outDir;
}

// "report.docx" -> "report.pdf" / "report-compressed.pdf" etc.
function renameExt(originalName, newExt, suffix = '') {
  const base = path.basename(originalName, path.extname(originalName));
  return `${base}${suffix}${newExt}`;
}

async function fileSize(filePath) {
  const stat = await fs.promises.stat(filePath);
  return stat.size;
}

module.exports = { PROGRESS, ConversionError, ensureOutDir, renameExt, fileSize };
