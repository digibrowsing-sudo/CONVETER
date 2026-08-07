'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

const { buildTestApp, FIXTURES } = require('./helpers');

function post(app, slug) {
  return request(app).post(`/api/v1/jobs?tool=${slug}`).field('tool', slug);
}

test('POST /v1/jobs rejects an unknown tool', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await request(ctx.app)
    .post('/api/v1/jobs?tool=not-a-tool')
    .attach('files', FIXTURES.pdf(), 'a.pdf');

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'BAD_REQUEST');
});

test('POST /v1/jobs refuses browser-side tools', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  // merge-pdf is Tier C: it runs in the browser and has no server path at all.
  const res = await post(ctx.app, 'merge-pdf').attach('files', FIXTURES.pdf(), 'a.pdf');

  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /runs in your browser/);
});

test('POST /v1/jobs rejects a file whose bytes contradict its extension', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  // A PNG renamed to .pdf passes the extension allowlist and must still fail.
  const res = await post(ctx.app, 'compress-pdf').attach('files', FIXTURES.png(), 'sneaky.pdf');

  assert.equal(res.status, 415);
  assert.equal(res.body.error.code, 'UNSUPPORTED_TYPE');
});

test('POST /v1/jobs rejects an extension the tool does not accept', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await post(ctx.app, 'compress-pdf').attach('files', FIXTURES.png(), 'image.png');

  assert.equal(res.status, 415);
  assert.equal(res.body.error.code, 'UNSUPPORTED_TYPE');
});

test('POST /v1/jobs enforces the per-tool size cap', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const oversized = Buffer.concat([FIXTURES.pdf(), Buffer.alloc(30 * 1024 * 1024, 0x20)]);
  const res = await post(ctx.app, 'compress-pdf').attach('files', oversized, 'big.pdf');

  assert.equal(res.status, 413);
  assert.equal(res.body.error.code, 'FILE_TOO_LARGE');
});

test('POST /v1/jobs queues a valid job and returns a poll-able record', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await post(ctx.app, 'compress-pdf')
    .field('options', JSON.stringify({ level: 'ebook' }))
    .attach('files', FIXTURES.pdf(), 'report.pdf');

  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.tool, 'compress-pdf');
  assert.ok(res.body.expiresAt);

  // Routed to the document queue, not the finance one.
  assert.equal(ctx.queues.doc.added.length, 1);
  assert.equal(ctx.queues.finance.added.length, 0);
  assert.equal(ctx.queues.doc.added[0].data.tier, 'S1');

  const status = await request(ctx.app).get(`/api/v1/jobs/${res.body.jobId}`);
  assert.equal(status.status, 200);
  assert.equal(status.body.status, 'queued');
});

test('POST /v1/jobs rejects options the schema does not allow', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await post(ctx.app, 'compress-pdf')
    .field('options', JSON.stringify({ level: 'lossless' }))
    .attach('files', FIXTURES.pdf(), 'report.pdf');

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'BAD_REQUEST');
});

test('finance jobs require explicit consent and use the finance queue', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const without = await post(ctx.app, 'bank-statement-to-excel').attach(
    'files',
    FIXTURES.pdf(),
    'statement.pdf',
  );
  assert.equal(without.status, 422);
  assert.equal(without.body.error.code, 'CONSENT_REQUIRED');

  const withConsent = await post(ctx.app, 'bank-statement-to-excel')
    .field('consent', 'true')
    .attach('files', FIXTURES.pdf(), 'statement.pdf');

  assert.equal(withConsent.status, 201);
  assert.equal(ctx.queues.finance.added.length, 1);
  assert.equal(ctx.queues.finance.added[0].data.tier, 'F');
  assert.equal(ctx.queues.doc.added.length, 0);
});

test('finance jobs get the shorter 15-minute retention', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const finance = await post(ctx.app, 'bank-statement-to-excel')
    .field('consent', 'true')
    .attach('files', FIXTURES.pdf(), 'statement.pdf');
  const standard = await post(ctx.app, 'compress-pdf').attach('files', FIXTURES.pdf(), 'a.pdf');

  const financeTtl = new Date(finance.body.expiresAt) - Date.now();
  const standardTtl = new Date(standard.body.expiresAt) - Date.now();

  assert.ok(financeTtl <= 15 * 60 * 1000, 'finance TTL is at most 15 minutes');
  assert.ok(standardTtl > 30 * 60 * 1000, 'standard TTL is the longer one');
});

test('a repeated Idempotency-Key returns the original job instead of queueing again', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const key = '6f1b9d3e-6f1b-4d3e-8f1b-9d3e6f1b9d3e';
  const first = await post(ctx.app, 'compress-pdf')
    .set('Idempotency-Key', key)
    .attach('files', FIXTURES.pdf(), 'a.pdf');
  const second = await post(ctx.app, 'compress-pdf')
    .set('Idempotency-Key', key)
    .attach('files', FIXTURES.pdf(), 'a.pdf');

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.jobId, first.body.jobId);
  assert.equal(ctx.queues.doc.added.length, 1, 'the duplicate did not cost a second job');
});

test('a rejected upload does not leave its file on disk', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  await post(ctx.app, 'compress-pdf')
    .field('options', JSON.stringify({ level: 'nope' }))
    .attach('files', FIXTURES.pdf(), 'a.pdf');

  const leftovers = fs.readdirSync(ctx.config.inDir);
  assert.deepEqual(leftovers, [], 'the upload directory was cleaned up');
});

test('DELETE /v1/jobs/:id purges the files immediately', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const created = await post(ctx.app, 'compress-pdf').attach('files', FIXTURES.pdf(), 'a.pdf');
  const jobId = created.body.jobId;
  assert.ok(fs.existsSync(path.join(ctx.config.inDir, jobId)));

  const res = await request(ctx.app).delete(`/api/v1/jobs/${jobId}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'deleted');
  assert.equal(fs.existsSync(path.join(ctx.config.inDir, jobId)), false);
});

test('status for an unknown job reports expiry rather than leaking existence', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await request(ctx.app).get('/api/v1/jobs/6f1b9d3e-6f1b-4d3e-8f1b-9d3e6f1b9d3e');

  assert.equal(res.status, 410);
  assert.equal(res.body.error.code, 'JOB_EXPIRED');
});

test('every response carries the security headers', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await request(ctx.app).get('/api/v1/tools');

  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(res.headers['content-security-policy'], /wasm-unsafe-eval/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
});

test('GET /v1/tools advertises exactly what the registry allows', async (t) => {
  const ctx = buildTestApp();
  t.after(ctx.cleanup);

  const res = await request(ctx.app).get('/api/v1/tools');
  const merge = res.body.tools.find((tool) => tool.slug === 'merge-pdf');
  const bank = res.body.tools.find((tool) => tool.slug === 'bank-statement-to-excel');

  assert.equal(res.status, 200);
  assert.equal(merge.tier, 'C');
  assert.equal(merge.serverSide, false);
  assert.equal(bank.requiresConsent, true);
  assert.equal(bank.maxBytes, 15 * 1024 * 1024);
});
