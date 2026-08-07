'use strict';

const fs = require('fs');
const express = require('express');
const cors = require('cors');

const defaultConfig = require('./config');
const defaultLogger = require('./utils/logger');
const registry = require('./tools/registry');
const { ApiError } = require('./errors');
const { assertSchemasComplete } = require('./validation/options');
const { createJobStore } = require('./utils/jobstore');
const { createIpHashMiddleware } = require('./utils/iphash');
const { createRedisConnection, createQueues } = require('./queue/producers');
const { createRateLimiter } = require('./middleware/rateLimit');
const { createJobsRouter } = require('./routes/jobs');
const { createDownloadRouter } = require('./routes/download');
const { createHealthRouter } = require('./routes/health');
const { createReaper } = require('./utils/reaper');

/**
 * Security headers (spec 12.6).
 *
 * `worker-src 'self' blob:` is the one addition to the spec's list: the Tier C
 * engines run in Web Workers, and Vite serves those from a blob URL. Without it
 * the browser-side tools — the ones whose whole selling point is that they do
 * not upload your file — silently fall back to the server.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}

function createApp({ config = defaultConfig, logger = defaultLogger, jobstore, queues, redis, rateLimiter }) {
  assertSchemasComplete();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Nginx / Traefik

  app.use(securityHeaders);
  app.use(cors({ origin: false })); // same-origin only
  app.use(express.json({ limit: '64kb' }));
  app.use(createIpHashMiddleware(config));

  // Request logging. No raw IP, no filename, no query string — the query string
  // carries download tokens (spec 13.1).
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.route ? req.baseUrl + req.route.path : req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  const v1 = express.Router();
  v1.use('/health', createHealthRouter({ config, redis, queues }));
  v1.use('/jobs', createDownloadRouter({ config, logger, jobstore }));
  v1.use('/jobs', createJobsRouter({ config, logger, jobstore, queues, redis, rateLimiter }));

  // The catalogue the API will actually accept, generated from the registry so
  // it can never drift from what the frontend offers (spec 5.1).
  v1.get('/tools', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      tools: registry.tools.map((tool) => ({
        slug: tool.slug,
        name: tool.name,
        tier: tool.tier,
        category: tool.category,
        acceptExts: tool.acceptExts,
        maxFiles: tool.maxFiles,
        maxBytes: tool.maxBytes,
        requiresConsent: Boolean(tool.requiresConsent),
        serverSide: registry.isServerRunnable(tool),
      })),
    });
  });

  app.use('/api/v1', v1);

  app.use('/api', (req, res) => {
    res.status(404).json(new ApiError('NOT_FOUND', 'No such endpoint.').toJSON());
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      if (err.extra.retryAfterSeconds) res.setHeader('Retry-After', String(err.extra.retryAfterSeconds));
      res.status(err.status).json(err.toJSON());
      return;
    }
    logger.error('unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json(new ApiError('INTERNAL', 'Something went wrong on our side.').toJSON());
  });

  return app;
}

async function main() {
  const config = defaultConfig;
  const logger = defaultLogger;

  for (const dir of [config.inDir, config.outDir, config.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const redis = createRedisConnection(config);
  const queues = createQueues(config, redis);
  const jobstore = createJobStore(redis, config);
  const rateLimiter = createRateLimiter({ config, redis, logger });

  const reaper = createReaper({ config, logger, jobstore, redis });
  const stopReaper = reaper.start();

  const app = createApp({ config, logger, jobstore, queues, redis, rateLimiter });
  const server = app.listen(config.port, () => {
    logger.info('FileForge API listening', {
      port: config.port,
      tools: registry.tools.length,
      serverTools: registry.serverTools.length,
    });
  });

  async function shutdown(signal) {
    logger.info('shutting down', { signal });
    stopReaper();
    server.close();
    try {
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
      await redis.quit();
    } catch (err) {
      logger.error('shutdown error', { error: err.message });
    }
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    defaultLogger.error('fatal startup error', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { createApp, CSP };
