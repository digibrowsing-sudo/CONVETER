'use strict';

const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const defaultConfig = require('./config');
const defaultLogger = require('./utils/logger');
const { createJobStore } = require('./utils/jobstore');
const { createCleanup } = require('./utils/cleanup');
const { createRedisConnection, createQueue } = require('./queue/queue');
const { createRateLimiter } = require('./middleware/ratelimit');
const { createConvertRouter } = require('./routes/convert');
const { createStatusRouter } = require('./routes/status');
const { createDownloadRouter } = require('./routes/download');

/**
 * Build the Express app. Dependencies are injected so tests can supply
 * fakes instead of a live Redis/queue.
 */
function createApp({ config = defaultConfig, logger = defaultLogger, jobstore, queue }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Nginx

  app.use(helmet());
  app.use(cors({ origin: false })); // same-origin only
  app.use(express.json());

  // JSON request logging
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/convert', createRateLimiter(config), createConvertRouter({ config, jobstore, queue, logger }));
  app.use('/api/status', createStatusRouter({ jobstore }));
  app.use('/api/download', createDownloadRouter({ config, jobstore }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // Central JSON error handler — every thrown/next()ed error ends here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) {
      logger.error('unhandled error', { error: err.message, stack: err.stack });
    }
    res.status(status).json({
      error: status >= 500 ? 'Internal server error.' : err.message,
    });
  });

  return app;
}

async function main() {
  const config = defaultConfig;
  const logger = defaultLogger;

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.convertedDir, { recursive: true });

  const connection = createRedisConnection(config);
  const queue = createQueue(config, connection);
  const jobstore = createJobStore(connection, config);

  createCleanup({ config, logger }).start();

  const app = createApp({ config, logger, jobstore, queue });
  const server = app.listen(config.port, () => {
    logger.info('FileForge API listening', { port: config.port });
  });

  async function shutdown(signal) {
    logger.info('shutting down', { signal });
    server.close();
    try {
      await queue.close();
      await connection.quit();
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

module.exports = { createApp };
