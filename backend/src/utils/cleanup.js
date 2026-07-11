'use strict';

// Deletes upload/converted directories older than FILE_TTL_MINUTES.
// Runs immediately on start, then every cleanupIntervalMs.

const fs = require('fs');
const path = require('path');

function createCleanup({ config, logger }) {
  async function sweepDir(dir) {
    let removed = 0;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return 0; // directory does not exist yet
    }
    const cutoff = Date.now() - config.fileTtlMs;
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      try {
        const stat = await fs.promises.stat(entryPath);
        if (stat.mtimeMs < cutoff) {
          await fs.promises.rm(entryPath, { recursive: true, force: true });
          removed += 1;
        }
      } catch (err) {
        logger.warn('cleanup: failed to remove entry', { path: entryPath, error: err.message });
      }
    }
    return removed;
  }

  async function runOnce() {
    const removed =
      (await sweepDir(config.uploadsDir)) + (await sweepDir(config.convertedDir));
    if (removed > 0) {
      logger.info('cleanup: removed expired entries', { removed });
    }
    return removed;
  }

  function start() {
    const timer = setInterval(() => {
      runOnce().catch((err) => logger.error('cleanup: sweep failed', { error: err.message }));
    }, config.cleanupIntervalMs);
    timer.unref();
    runOnce().catch((err) => logger.error('cleanup: sweep failed', { error: err.message }));
    return () => clearInterval(timer);
  }

  return { runOnce, start };
}

module.exports = { createCleanup };
