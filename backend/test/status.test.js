'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { buildTestApp } = require('./helpers');

test('GET /api/status/:jobId returns 404 for unknown job', async () => {
  const { app } = buildTestApp();
  const res = await request(app).get(`/api/status/${randomUUID()}`);
  assert.equal(res.status, 404);
  assert.match(res.body.error, /not found or expired/i);
});

test('GET /api/status/:jobId returns 404 for a malformed id', async () => {
  const { app } = buildTestApp();
  const res = await request(app).get('/api/status/../../etc/passwd');
  assert.equal(res.status, 404);
});

test('GET /api/status/:jobId reports a processing job', async () => {
  const { app, jobstore } = buildTestApp();
  const jobId = randomUUID();
  await jobstore.create(jobId, { tool: 'compress-pdf' });
  await jobstore.update(jobId, { status: 'processing', progress: 50 });

  const res = await request(app).get(`/api/status/${jobId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'processing');
  assert.equal(res.body.progress, 50);
  assert.equal(res.body.downloadReady, false);
});

test('GET /api/status/:jobId reports a completed job with result metadata', async () => {
  const { app, jobstore } = buildTestApp();
  const jobId = randomUUID();
  await jobstore.create(jobId, { tool: 'compress-pdf' });
  await jobstore.update(jobId, {
    status: 'completed',
    progress: 100,
    result: { outputName: 'out.pdf', outputPath: '/x/out.pdf', size: 123, originalSize: 456 },
  });

  const res = await request(app).get(`/api/status/${jobId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.downloadReady, true);
  assert.equal(res.body.result.outputName, 'out.pdf');
  assert.equal(res.body.result.size, 123);
  assert.equal(res.body.result.originalSize, 456);
  assert.equal(res.body.result.outputPath, undefined, 'internal path is not exposed');
});

test('GET /api/status/:jobId reports a failed job with its error', async () => {
  const { app, jobstore } = buildTestApp();
  const jobId = randomUUID();
  await jobstore.create(jobId, { tool: 'pdf-to-word' });
  await jobstore.update(jobId, { status: 'failed', error: 'This PDF could not be converted.' });

  const res = await request(app).get(`/api/status/${jobId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'failed');
  assert.match(res.body.error, /could not be converted/);
  assert.equal(res.body.downloadReady, false);
});
