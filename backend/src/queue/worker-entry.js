'use strict';

// Single worker process that handles every conversion tool.
// PM2 runs two instances of this file; each processes jobs with
// concurrency = config.workerConcurrency.

const fs = require('fs');
const { Worker } = require('bullmq');

const config = require('../config');
const logger = require('../utils/logger');
const { createJobStore } = require('../utils/jobstore');
const { createRedisConnection } = require('./queue');
const { PROGRESS, ConversionError } = require('./workers/common');

const workerModules = [
  require('./workers/document.worker'),
  require('./workers/pdf.worker'),
  require('./workers/pdf2docx.worker'),
  require('./workers/image.worker'),
];

const handlers = new Map();
for (const mod of workerModules) {
  for (const tool of mod.tools) handlers.set(tool, mod.process);
}

const GENERIC_ERROR = 'Conversion failed. Please check the file and try again.';

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ConversionError(`Conversion timed out after ${ms / 1000} seconds.`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.convertedDir, { recursive: true });

  const connection = createRedisConnection(config);
  const jobstore = createJobStore(connection, config);
  const ctx = { config, logger, jobstore };

  const worker = new Worker(
    config.queueName,
    async (job) => {
      const { jobId, tool, uploadDir } = job.data;
      const handler = handlers.get(tool);
      if (!handler) throw new Error(`No worker registered for tool "${tool}"`);

      logger.info('job started', { jobId, tool });
      await jobstore.setProgress(jobId, PROGRESS.RECEIVED);
      try {
        const result = await withTimeout(handler(job, ctx), config.jobTimeoutMs);
        await jobstore.complete(jobId, result);
        logger.info('job completed', { jobId, tool, outputName: result.outputName, size: result.size });
        return result;
      } catch (err) {
        const message = err instanceof ConversionError ? err.userMessage : GENERIC_ERROR;
        await jobstore.fail(jobId, message);
        logger.error('job failed', { jobId, tool, error: err.message });
        throw err;
      } finally {
        // Inputs are no longer needed once the job has finished either way.
        if (uploadDir) {
          fs.promises.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
    { connection, concurrency: config.workerConcurrency },
  );

  worker.on('error', (err) => logger.error('worker error', { error: err.message }));

  logger.info('FileForge worker started', {
    tools: [...handlers.keys()],
    concurrency: config.workerConcurrency,
  });

  async function shutdown(signal) {
    logger.info('worker shutting down', { signal });
    await worker.close();
    await connection.quit();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('fatal worker startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
