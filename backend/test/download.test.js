'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { buildTestApp } = require('./helpers');
const { createToken } = require('../src/utils/downloadToken');

/** Put a finished job and its output file in place, bypassing the queue. */
async function completeJob(ctx, { tier = 'S1', body = 'converted output' } = {}) {
  const jobId = randomUUID();
  const outDir = path.join(ctx.config.outDir, jobId);
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'result.pdf');
  fs.writeFileSync(outputPath, body);

  await ctx.jobstore.create(jobId, {
    toolSlug: tier === 'F' ? 'bank-statement-to-excel' : 'compress-pdf',
    tier,
    ipHash: 'test',
    inputCount: 1,
    inputBytes: 10,
    options: {},
  });
  await ctx.jobstore.complete(jobId, {
    outputPath,
    outputName: 'result.pdf',
    size: body.length,
  });

  return { jobId, outputPath };
}

function tokenFor(ctx, jobId) {
  return createToken(jobId, ctx.config.downloadSigningSecret, ctx.config.downloadTokenTtlMs);
}

test('a valid token downloads the file as an attachment', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId } = await completeJob(ctx);
  const res = await request(ctx.app)
    .get(`/api/v1/jobs/${jobId}/download`)
    .query({ t: tokenFor(ctx, jobId) });

  assert.equal(res.status, 200);
  assert.match(res.headers['content-disposition'], /^attachment/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('a missing or forged token is refused', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId } = await completeJob(ctx);

  const noToken = await request(ctx.app).get(`/api/v1/jobs/${jobId}/download`);
  assert.equal(noToken.status, 403);
  assert.equal(noToken.body.error.code, 'INVALID_TOKEN');

  const forged = await request(ctx.app)
    .get(`/api/v1/jobs/${jobId}/download`)
    .query({ t: `${Date.now() + 60000}.notarealsignature` });
  assert.equal(forged.status, 403);
});

test('a token minted for one job does not work on another', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const first = await completeJob(ctx);
  const second = await completeJob(ctx);

  const res = await request(ctx.app)
    .get(`/api/v1/jobs/${second.jobId}/download`)
    .query({ t: tokenFor(ctx, first.jobId) });

  assert.equal(res.status, 403);
});

test('an expired token is refused', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId } = await completeJob(ctx);
  const expired = createToken(jobId, ctx.config.downloadSigningSecret, -1000);

  const res = await request(ctx.app).get(`/api/v1/jobs/${jobId}/download`).query({ t: expired });

  assert.equal(res.status, 410);
  assert.equal(res.body.error.code, 'JOB_EXPIRED');
});

test('a job record pointing outside the output root is not served', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId } = await completeJob(ctx);
  await ctx.jobstore.update(jobId, {
    result: { outputPath: '/etc/passwd', outputName: 'passwd', size: 1 },
  });

  const res = await request(ctx.app)
    .get(`/api/v1/jobs/${jobId}/download`)
    .query({ t: tokenFor(ctx, jobId) });

  assert.equal(res.status, 404);
});

test('a finance download purges the file immediately (spec 10.2)', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId, outputPath } = await completeJob(ctx, { tier: 'F' });

  const res = await request(ctx.app)
    .get(`/api/v1/jobs/${jobId}/download`)
    .query({ t: tokenFor(ctx, jobId) });
  assert.equal(res.status, 200);

  // The purge runs in res.download's completion callback, just after the
  // response is flushed.
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(fs.existsSync(outputPath), false, 'the statement was deleted on download');
  const after = await ctx.jobstore.get(jobId);
  assert.equal(after.status, 'expired');
});

test('a standard download keeps the file for the rest of its TTL', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId, outputPath } = await completeJob(ctx, { tier: 'S1' });

  await request(ctx.app).get(`/api/v1/jobs/${jobId}/download`).query({ t: tokenFor(ctx, jobId) });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(fs.existsSync(outputPath), true, 're-downloading within the hour still works');
});

test('the completed status response includes a signed download URL', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const { jobId } = await completeJob(ctx, { tier: 'F' });
  const res = await request(ctx.app).get(`/api/v1/jobs/${jobId}`);

  assert.equal(res.body.status, 'completed');
  assert.match(res.body.download.url, /\/download\?t=\d+\./);
  assert.equal(res.body.singleUse, true, 'the UI is told this file vanishes on download');
});
