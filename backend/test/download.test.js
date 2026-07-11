'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const { buildTestApp } = require('./helpers');

test('GET /api/download/:jobId returns 404 while job is not completed', async () => {
  const { app, jobstore } = buildTestApp();
  const jobId = randomUUID();
  await jobstore.create(jobId, { tool: 'compress-pdf' });

  const res = await request(app).get(`/api/download/${jobId}`);
  assert.equal(res.status, 404);
});

test('GET /api/download/:jobId streams the converted file with a filename', async () => {
  const { app, jobstore, config } = buildTestApp();
  const jobId = randomUUID();
  const outDir = path.join(config.convertedDir, jobId);
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'result.pdf');
  fs.writeFileSync(outputPath, '%PDF-1.4 fake');

  await jobstore.create(jobId, { tool: 'compress-pdf' });
  await jobstore.update(jobId, {
    status: 'completed',
    result: { outputPath, outputName: 'report-compressed.pdf', size: 13 },
  });

  const res = await request(app)
    .get(`/api/download/${jobId}`)
    .buffer(true)
    .parse((response, cb) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-disposition'], /report-compressed\.pdf/);
  assert.equal(res.body.toString(), '%PDF-1.4 fake');
});

test('GET /api/download/:jobId refuses paths outside the converted dir', async () => {
  const { app, jobstore } = buildTestApp();
  const jobId = randomUUID();
  await jobstore.create(jobId, { tool: 'compress-pdf' });
  await jobstore.update(jobId, {
    status: 'completed',
    result: { outputPath: '/etc/passwd', outputName: 'passwd' },
  });

  const res = await request(app).get(`/api/download/${jobId}`);
  assert.equal(res.status, 404);
});

test('GET /api/download/:jobId returns 404 after the file was cleaned up', async () => {
  const { app, jobstore, config } = buildTestApp();
  const jobId = randomUUID();
  await jobstore.create(jobId, { tool: 'compress-pdf' });
  await jobstore.update(jobId, {
    status: 'completed',
    result: {
      outputPath: path.join(config.convertedDir, jobId, 'gone.pdf'),
      outputName: 'gone.pdf',
    },
  });

  const res = await request(app).get(`/api/download/${jobId}`);
  assert.equal(res.status, 404);
  assert.match(res.body.error, /expired/i);
});
