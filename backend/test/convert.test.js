'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildTestApp } = require('./helpers');

test('POST /api/convert rejects request without a file', async () => {
  const { app } = buildTestApp();
  const res = await request(app).post('/api/convert').field('tool', 'doc-to-pdf');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /No file uploaded/);
});

test('POST /api/convert rejects unknown tool', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'make-coffee')
    .attach('file', Buffer.from('hello'), 'sample.txt');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Unknown tool/);
});

test('POST /api/convert rejects non-whitelisted extension', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'doc-to-pdf')
    .attach('file', Buffer.from('MZ'), 'malware.exe');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not supported/);
});

test('POST /api/convert rejects extension that does not match the tool', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'pdf-to-word')
    .attach('file', Buffer.from('hello'), 'notes.txt');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /does not accept/);
});

test('POST /api/convert rejects file over the size cap with 413', async () => {
  const { app } = buildTestApp({ maxFileSizeBytes: 10, maxFileSizeMb: 1 });
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'doc-to-pdf')
    .attach('file', Buffer.alloc(1024, 'a'), 'big.txt');
  assert.equal(res.status, 413);
  assert.match(res.body.error, /too large/i);
});

test('POST /api/convert rejects merge with a single file', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'merge-pdf')
    .attach('files', Buffer.from('%PDF-1.4'), 'one.pdf');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /at least 2/);
});

test('POST /api/convert rejects invalid options JSON', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'doc-to-pdf')
    .field('options', '{not json')
    .attach('file', Buffer.from('hello'), 'sample.txt');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /valid JSON/);
});

test('POST /api/convert rejects image-convert without a valid targetFormat', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'image-convert')
    .field('targetFormat', 'exe')
    .attach('file', Buffer.from('fake'), 'photo.png');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /targetFormat/);
});

test('POST /api/convert queues a valid job and returns jobId', async () => {
  const { app, jobstore, queue } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'doc-to-pdf')
    .attach('file', Buffer.from('hello world'), 'sample.txt');

  assert.equal(res.status, 202);
  assert.ok(res.body.jobId, 'response has jobId');

  assert.equal(queue.added.length, 1);
  const queued = queue.added[0];
  assert.equal(queued.name, 'doc-to-pdf');
  assert.equal(queued.opts.jobId, res.body.jobId);
  assert.equal(queued.data.inputs.length, 1);
  assert.equal(queued.data.inputs[0].originalName, 'sample.txt');

  const stored = await jobstore.get(res.body.jobId);
  assert.equal(stored.status, 'queued');
});

test('POST /api/convert queues merge-pdf with multiple files in order', async () => {
  const { app, queue } = buildTestApp();
  const res = await request(app)
    .post('/api/convert')
    .field('tool', 'merge-pdf')
    .attach('files', Buffer.from('%PDF-1.4 a'), 'a.pdf')
    .attach('files', Buffer.from('%PDF-1.4 b'), 'b.pdf');

  assert.equal(res.status, 202);
  const queued = queue.added[0];
  assert.deepEqual(
    queued.data.inputs.map((i) => i.originalName),
    ['a.pdf', 'b.pdf'],
  );
});
