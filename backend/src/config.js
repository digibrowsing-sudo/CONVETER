'use strict';

// Single source of truth for every limit, path, TTL and secret.
// Values come from .env (see .env.example); nothing is hard-coded elsewhere.
//
// Per-tool limits are NOT here — they live in shared/tools.json and are read
// through src/tools/registry.js (spec 5.1).

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function intEnv(env, name, fallback) {
  const value = Number.parseInt(env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function requiredSecret(env, name) {
  const value = env[name];
  if (value && value.length >= 32) return value;

  // A missing signing secret in production would make download tokens forgeable,
  // so refuse to boot rather than quietly falling back to something guessable.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      `${name} is required in production and must be at least 32 characters. ` +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return crypto.randomBytes(32).toString('hex');
}

const MINUTE = 60 * 1000;

function createConfig(env = process.env) {
  const storageRoot = path.resolve(REPO_ROOT, env.STORAGE_ROOT || env.STORAGE_PATH || './storage');

  return {
    env: env.NODE_ENV || 'development',
    port: intEnv(env, 'PORT', 8095),
    redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379',
    publicWebUrl: env.PUBLIC_WEB_URL || 'https://fileforge.in',

    // Absolute ceiling applied before per-tool caps, so a request for a tool we
    // do not recognise still cannot stream an unbounded body to disk.
    maxUploadBytes: intEnv(env, 'MAX_UPLOAD_BYTES', 100 * 1024 * 1024),

    // Spec 10.2 — retention is a promise, not a tuning knob.
    ttlMs: {
      S1: intEnv(env, 'TTL_STANDARD_MINUTES', 60) * MINUTE,
      S2: intEnv(env, 'TTL_STANDARD_MINUTES', 60) * MINUTE,
      F: intEnv(env, 'TTL_FINANCE_MINUTES', 15) * MINUTE,
      failed: intEnv(env, 'TTL_FAILED_MINUTES', 15) * MINUTE,
    },

    // Spec 8.2 — deterministic failures are never retried; see errors.js.
    retry: {
      S1: { attempts: 3, backoffMs: 1000, timeoutMs: 30 * 1000 },
      S2: { attempts: 2, backoffMs: 5000, timeoutMs: 180 * 1000 },
      F: { attempts: 2, backoffMs: 3000, timeoutMs: 120 * 1000 },
    },

    // Spec 8.3 — two queues so a finance job never waits behind a 90s render.
    queues: {
      doc: { name: 'ff-doc', concurrency: 1, limiter: { max: 20, duration: 60_000 } },
      finance: { name: 'ff-finance', concurrency: 1, limiter: { max: 30, duration: 60_000 } },
    },
    queueDepthLimit: intEnv(env, 'QUEUE_DEPTH_LIMIT', 25),

    // Spec 12.5 — Tier C is absent on purpose: it costs us nothing, so it is
    // not limited. Shapes are plan-aware (spec 16.5) but only 'free' exists.
    rateLimits: {
      free: {
        burst: { max: intEnv(env, 'RL_BURST_MAX', 5), windowMs: MINUTE },
        serverHourly: { max: intEnv(env, 'RL_SERVER_HOURLY', 15), windowMs: 60 * MINUTE },
        serverDaily: { max: intEnv(env, 'RL_SERVER_DAILY', 60), windowMs: 24 * 60 * MINUTE },
        financeHourly: { max: intEnv(env, 'RL_FINANCE_HOURLY', 5), windowMs: 60 * MINUTE },
        financeDaily: { max: intEnv(env, 'RL_FINANCE_DAILY', 20), windowMs: 24 * 60 * MINUTE },
        bytesDaily: {
          max: intEnv(env, 'RL_BYTES_DAILY_MB', 200) * 1024 * 1024,
          windowMs: 24 * 60 * MINUTE,
        },
      },
    },

    storageRoot,
    inDir: path.join(storageRoot, 'in'),
    outDir: path.join(storageRoot, 'out'),
    tmpDir: path.join(storageRoot, 'tmp'),

    // Spec 10.3 — the reaper, including the non-optional orphan sweep.
    reaper: {
      intervalMs: intEnv(env, 'REAPER_INTERVAL_MINUTES', 5) * MINUTE,
      diskWarnPercent: intEnv(env, 'DISK_WARN_PERCENT', 75),
      diskPurgePercent: intEnv(env, 'DISK_PURGE_PERCENT', 80),
      // Grace before a directory with no job row is treated as an orphan: a job
      // being created right now has files on disk before Redis knows about it.
      orphanGraceMs: 15 * MINUTE,
    },

    downloadSigningSecret: requiredSecret(env, 'DOWNLOAD_SIGNING_SECRET'),
    downloadTokenTtlMs: intEnv(env, 'DOWNLOAD_TOKEN_TTL_MINUTES', 60) * MINUTE,
    // Rotated daily by the reaper so a hashed IP cannot be correlated across days.
    ipHashSalt: env.IP_HASH_SALT || crypto.randomBytes(16).toString('hex'),

    idempotencyTtlMs: 10 * MINUTE,

    // Spec 12.1 — validation-chain thresholds.
    validation: {
      maxPdfPages: intEnv(env, 'MAX_PDF_PAGES', 500),
      zipBombRatio: 20,
      zipBombMaxUncompressedBytes: 500 * 1024 * 1024,
    },

    // Engine memory ceiling (ulimit -v) for spawned converters (spec 12.4).
    engineMemoryLimitKb: intEnv(env, 'ENGINE_MEMORY_LIMIT_MB', 1024) * 1024,

    imageTargetFormats: ['jpg', 'png', 'webp'],
    imageDefaultQuality: 85,
    gsPresets: ['screen', 'ebook', 'printer'],
    gsDefaultPreset: 'ebook',

    logLevel: env.LOG_LEVEL || 'info',
  };
}

module.exports = createConfig();
module.exports.createConfig = createConfig;
