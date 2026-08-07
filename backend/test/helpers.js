'use strict';

// Test doubles. The API is built with its dependencies injected precisely so
// that the request path can be exercised without a live Redis or BullMQ.

const os = require('os');
const path = require('path');
const fs = require('fs');
const { createConfig } = require('../src/config');
const { createApp } = require('../src/server');
const { createJobStore } = require('../src/utils/jobstore');
const { createRateLimiter } = require('../src/middleware/rateLimit');

const silentLogger = { info() {}, warn() {}, error() {} };

/**
 * Enough of ioredis for the API path: string values with expiry, counters,
 * a MULTI that resolves in ioredis' [[err, value], ...] shape, and SCAN.
 */
function createFakeRedis() {
  const store = new Map();

  const alive = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  const ttlFromArgs = (args) => {
    const flag = String(args[0] || '').toUpperCase();
    if (flag === 'EX') return Number(args[1]) * 1000;
    if (flag === 'PX') return Number(args[1]);
    return null;
  };

  const redis = {
    store,
    async set(key, value, ...args) {
      const ttlMs = ttlFromArgs(args);
      store.set(key, { value: String(value), expiresAt: ttlMs ? Date.now() + ttlMs : null });
      return 'OK';
    },
    async get(key) {
      return alive(key)?.value ?? null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async incrby(key, amount) {
      const current = Number(alive(key)?.value ?? 0) + Number(amount);
      store.set(key, { value: String(current), expiresAt: alive(key)?.expiresAt ?? null });
      return current;
    },
    async expire(key, seconds) {
      const entry = alive(key);
      if (!entry) return 0;
      if (!entry.expiresAt) entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    multi() {
      const operations = [];
      const chain = {
        incrby: (key, amount) => (operations.push(['incrby', key, amount]), chain),
        expire: (key, seconds) => (operations.push(['expire', key, seconds]), chain),
        async exec() {
          const results = [];
          for (const [name, ...args] of operations) results.push([null, await redis[name](...args)]);
          return results;
        },
      };
      return chain;
    },
    async scan(cursor, _match, pattern, _count) {
      const prefix = String(pattern).replace(/\*$/, '');
      return ['0', [...store.keys()].filter((key) => key.startsWith(prefix) && alive(key))];
    },
    async quit() {},
  };
  return redis;
}

function createFakeQueue() {
  const added = [];
  return {
    added,
    async add(name, data, opts) {
      added.push({ name, data, opts });
      return { id: opts?.jobId };
    },
    async getWaitingCount() {
      return added.length;
    },
    async close() {},
  };
}

function buildTestApp(configOverrides = {}) {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fileforge-test-'));
  const config = {
    ...createConfig({
      NODE_ENV: 'test',
      STORAGE_ROOT: storageRoot,
      DOWNLOAD_SIGNING_SECRET: 'test-secret-that-is-long-enough-32chars',
      IP_HASH_SALT: 'test-salt',
    }),
    // createConfig resolves STORAGE_ROOT relative to the repo; the mkdtemp path
    // is already absolute, so re-derive the directories from it directly.
    storageRoot,
    inDir: path.join(storageRoot, 'in'),
    outDir: path.join(storageRoot, 'out'),
    tmpDir: path.join(storageRoot, 'tmp'),
    ...configOverrides,
  };

  for (const dir of [config.inDir, config.outDir, config.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const redis = createFakeRedis();
  const jobstore = createJobStore(redis, config);
  const queues = { doc: createFakeQueue(), finance: createFakeQueue() };
  const rateLimiter = createRateLimiter({ config, redis, logger: silentLogger });
  const app = createApp({ config, logger: silentLogger, jobstore, queues, redis, rateLimiter });

  return {
    app,
    config,
    redis,
    jobstore,
    queues,
    storageRoot,
    cleanup: () => fs.rmSync(storageRoot, { recursive: true, force: true }),
  };
}

/** Smallest byte sequences that pass the magic-byte check for each format. */
const FIXTURES = {
  pdf: () =>
    Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R>>endobj\n' +
        'trailer<</Root 1 0 R>>\n%%EOF\n',
      'latin1',
    ),
  png: () =>
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 1),
    ]),
  jpeg: () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]),
  text: () => Buffer.from('hello, this is a plain text file\n', 'utf8'),
};

module.exports = { buildTestApp, createFakeRedis, createFakeQueue, silentLogger, FIXTURES };
