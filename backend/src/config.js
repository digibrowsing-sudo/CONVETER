'use strict';

// Single source of truth for every limit, path and TTL.
// Values come from .env (see .env.example); nothing is hard-coded elsewhere.

require('dotenv').config();

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TOOLS = [
  'doc-to-pdf',
  'pdf-to-word',
  'compress-pdf',
  'merge-pdf',
  'split-pdf',
  'image-convert',
];

const DOCUMENT_EXTENSIONS = ['.doc', '.docx', '.odt', '.rtf', '.txt', '.xls', '.xlsx', '.ppt', '.pptx'];
const PDF_EXTENSIONS = ['.pdf'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff', '.bmp', '.heic'];

// Extension whitelist with the MIME types browsers commonly report for each.
// application/octet-stream is additionally accepted for any whitelisted
// extension because browsers fall back to it for types they don't know.
const ALLOWED_MIME_TYPES = {
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.odt': ['application/vnd.oasis.opendocument.text'],
  '.rtf': ['application/rtf', 'text/rtf'],
  '.txt': ['text/plain'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  '.tiff': ['image/tiff'],
  '.bmp': ['image/bmp', 'image/x-ms-bmp'],
  '.heic': ['image/heic', 'image/heif'],
};

const TOOL_INPUT_EXTENSIONS = {
  'doc-to-pdf': DOCUMENT_EXTENSIONS,
  'pdf-to-word': PDF_EXTENSIONS,
  'compress-pdf': PDF_EXTENSIONS,
  'merge-pdf': PDF_EXTENSIONS,
  'split-pdf': PDF_EXTENSIONS,
  'image-convert': IMAGE_EXTENSIONS,
};

function intEnv(env, name, fallback) {
  const value = Number.parseInt(env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function createConfig(env = process.env) {
  const maxFileSizeMb = intEnv(env, 'MAX_FILE_SIZE_MB', 50);
  const fileTtlMinutes = intEnv(env, 'FILE_TTL_MINUTES', 60);
  const storagePath = path.resolve(REPO_ROOT, env.STORAGE_PATH || './storage');

  return {
    port: intEnv(env, 'PORT', 8095),
    redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379',

    maxFileSizeMb,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,

    fileTtlMinutes,
    fileTtlMs: fileTtlMinutes * 60 * 1000,

    rateLimit: {
      max: intEnv(env, 'RATE_LIMIT_MAX', 30),
      windowMs: intEnv(env, 'RATE_LIMIT_WINDOW_MIN', 15) * 60 * 1000,
    },

    storagePath,
    uploadsDir: path.join(storagePath, 'uploads'),
    convertedDir: path.join(storagePath, 'converted'),

    queueName: 'conversions',
    workerConcurrency: 2,
    jobTimeoutMs: 120 * 1000,
    cleanupIntervalMs: 10 * 60 * 1000,
    maxMergeFiles: 20,

    imageTargetFormats: ['jpg', 'png', 'webp'],
    imageDefaultQuality: 85,
    gsPresets: ['screen', 'ebook', 'printer'],
    gsDefaultPreset: 'ebook',

    tools: TOOLS,
    toolInputExtensions: TOOL_INPUT_EXTENSIONS,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  };
}

module.exports = createConfig();
module.exports.createConfig = createConfig;
