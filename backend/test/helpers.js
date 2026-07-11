'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { createConfig } = require('../src/config');
const { createApp } = require('../src/server');

const silentLogger = { info() {}, warn() {}, error() {} };

// In-memory stand-ins for Redis-backed jobstore and BullMQ queue.
function createFakeJobStore() {
  const jobs = new Map();
  return {
    jobs,
    async create(jobId, fields) {
      jobs.set(jobId, { jobId, status: 'queued', progress: 0, ...fields });
    },
    async get(jobId) {
      return jobs.get(jobId) || null;
    },
    async update(jobId, fields) {
      jobs.set(jobId, { ...(jobs.get(jobId) || { jobId }), ...fields });
    },
  };
}

function createFakeQueue() {
  const added = [];
  return {
    added,
    async add(name, data, opts) {
      added.push({ name, data, opts });
      return { id: opts?.jobId };
    },
  };
}

function buildTestApp(configOverrides = {}) {
  const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'fileforge-test-'));
  const config = {
    ...createConfig({ STORAGE_PATH: storagePath }),
    storagePath,
    uploadsDir: path.join(storagePath, 'uploads'),
    convertedDir: path.join(storagePath, 'converted'),
    ...configOverrides,
  };
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.convertedDir, { recursive: true });

  const jobstore = createFakeJobStore();
  const queue = createFakeQueue();
  const app = createApp({ config, logger: silentLogger, jobstore, queue });
  return { app, config, jobstore, queue };
}

module.exports = { buildTestApp };
