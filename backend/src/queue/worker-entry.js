'use strict';

// Worker process. Started once per queue:
//
//   node src/queue/worker-entry.js doc
//   node src/queue/worker-entry.js finance
//
// Each runs at concurrency 1 (spec 3.2). The box has 2 vCPU shared with EMS,
// ARIA, the investment bot and Coolify, and a converter that saturates both of
// them takes down a paying client's system, not just ours.

const fs = require('fs');
const path = require('path');
const { Worker, UnrecoverableError } = require('bullmq');

const config = require('../config');
const logger = require('../utils/logger');
const registry = require('../tools/registry');
const { ApiError } = require('../errors');
const { createJobStore } = require('../utils/jobstore');
const { createRedisConnection, queueNameForTier } = require('./producers');
const { startHeartbeat } = require('./heartbeat');
const { PROGRESS } = require('./workers/common');

const PROCESSORS = [
  require('./workers/document.worker'),
  require('./workers/pdf.worker'),
  require('./workers/pdf2docx.worker'),
  require('./workers/image.worker'),
  require('./workers/finance.worker'),
];

const GENERIC_MESSAGE = 'Conversion failed. Please check the file and try again.';

function buildHandlerMap(queueName) {
  const handlers = new Map();
  for (const processor of PROCESSORS) {
    for (const slug of processor.tools) {
      const tool = registry.get(slug);
      if (!tool) throw new Error(`processor registered for unknown tool "${slug}"`);
      const tier = registry.effectiveTier(tool);
      if (queueNameForTier(tier) === queueName) handlers.set(slug, processor.process);
    }
  }
  return handlers;
}

/** Fail fast if a server-side tool in the registry has no processor anywhere. */
function assertCoverage() {
  const covered = new Set(PROCESSORS.flatMap((processor) => processor.tools));
  const missing = registry.serverTools.map((tool) => tool.slug).filter((slug) => !covered.has(slug));
  if (missing.length > 0) throw new Error(`no processor for: ${missing.join(', ')}`);
}

function withTimeout(promise, ms, toolName) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new ApiError('TIMEOUT', `${toolName} took too long and was stopped.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  const queueName = process.argv[2];
  const settings = config.queues[queueName];
  if (!settings) {
    logger.error('unknown queue', { queueName, expected: Object.keys(config.queues) });
    process.exit(1);
  }

  assertCoverage();
  const handlers = buildHandlerMap(queueName);

  for (const dir of [config.inDir, config.outDir, config.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const connection = createRedisConnection(config);
  const jobstore = createJobStore(connection, config);
  const stopHeartbeat = startHeartbeat(connection, queueName, logger);
  const ctx = { config, logger, jobstore };

  const worker = new Worker(
    settings.name,
    async (bullJob) => {
      const { jobId, toolSlug, tier } = bullJob.data;
      const handler = handlers.get(toolSlug);
      if (!handler) throw new UnrecoverableError(`no processor for "${toolSlug}" on queue ${queueName}`);

      const record = await jobstore.get(jobId);
      if (!record) {
        // Deleted by the user or reaped while it waited. Nothing to convert.
        throw new UnrecoverableError('job record has expired');
      }

      const attempt = bullJob.attemptsMade + 1;
      const maxAttempts = config.retry[tier]?.attempts ?? 1;
      const isFinalAttempt = attempt >= maxAttempts;

      logger.info('job started', { jobId, toolSlug, tier, attempt, queue: queueName });
      await jobstore.setProgress(jobId, PROGRESS.RECEIVED);

      try {
        const result = await withTimeout(
          handler(record, ctx),
          config.retry[tier].timeoutMs,
          registry.get(toolSlug)?.name || toolSlug,
        );
        await jobstore.complete(jobId, result);
        logger.info('job completed', {
          jobId,
          toolSlug,
          tier,
          outputBytes: result.size,
          warnings: result.warnings?.length || 0,
        });
        await cleanupInputs(record);
        return { size: result.size };
      } catch (err) {
        const apiError =
          err instanceof ApiError ? err : new ApiError('CONVERSION_FAILED', GENERIC_MESSAGE);

        // Spec 8.2: deterministic failures are never retried. Retrying a
        // corrupt file burns CPU on an outcome that cannot change.
        const giveUp = apiError.unrecoverable || isFinalAttempt;
        if (giveUp) {
          await jobstore.fail(jobId, { code: apiError.code, message: apiError.message });
          await cleanupInputs(record);
        }

        logger.error('job failed', {
          jobId,
          toolSlug,
          tier,
          code: apiError.code,
          attempt,
          willRetry: !giveUp,
        });

        if (apiError.unrecoverable) throw new UnrecoverableError(apiError.code);
        throw err;
      } finally {
        // Scratch space is never needed after an attempt, even a failed one.
        await fs.promises
          .rm(path.join(config.tmpDir, jobId), { recursive: true, force: true })
          .catch(() => {});
      }
    },
    {
      connection,
      concurrency: settings.concurrency,
      limiter: settings.limiter,
      // Give a long S2 render time to finish before BullMQ decides the worker
      // has stalled and hands the job to someone else.
      lockDuration: config.retry.S2.timeoutMs + 30_000,
    },
  );

  /** Inputs are dead weight once a job has reached a terminal state. */
  async function cleanupInputs(record) {
    await fs.promises
      .rm(path.join(config.inDir, record.jobId), { recursive: true, force: true })
      .catch(() => {});
  }

  worker.on('error', (err) => logger.error('worker error', { queue: queueName, error: err.message }));

  logger.info('FileForge worker started', {
    queue: queueName,
    concurrency: settings.concurrency,
    tools: [...handlers.keys()],
  });

  async function shutdown(signal) {
    logger.info('worker shutting down', { queue: queueName, signal });
    // Spec 11.4: finish the job in hand, then exit. A half-converted file that
    // the user is polling for is worse than a slightly slower deploy.
    await worker.close();
    await stopHeartbeat();
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
