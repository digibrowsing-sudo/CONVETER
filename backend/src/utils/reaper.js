'use strict';

// The reaper (spec 10.3). Runs every five minutes and does four things:
//
//   1. purges the files of every job past its TTL
//   2. sweeps orphaned directories left behind by a crashed worker
//   3. watches disk usage and purges aggressively under pressure
//   4. alerts when it does
//
// Step 2 is not optional. A crashed worker leaves directories behind, and a
// full disk on this box takes down EMS, ARIA and Coolify at the same time —
// FileForge is not the only tenant here.

const fs = require('fs');
const path = require('path');

const { purgeJobFiles, UUID_RE } = require('./purge');
const { KEY_PREFIX } = require('./jobstore');
const { createAlerter } = require('./alert');

const SCAN_COUNT = 200;

async function diskUsagePercent(dir) {
  try {
    const stats = await fs.promises.statfs(dir);
    const total = stats.blocks * stats.bsize;
    const available = stats.bavail * stats.bsize;
    if (!total) return null;
    return Math.round(((total - available) / total) * 100);
  } catch {
    return null; // statfs is unavailable on some filesystems; not fatal
  }
}

async function listJobDirs(root) {
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && UUID_RE.test(entry.name));
  } catch {
    return [];
  }
}

function createReaper({ config, logger, jobstore, redis, alerter }) {
  const alert = alerter || createAlerter({ logger });

  /** Every job record currently in Redis, as {jobId, job} pairs. */
  async function* scanJobs() {
    if (!redis) return;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', SCAN_COUNT);
      cursor = next;
      for (const key of keys) {
        const raw = await redis.get(key);
        if (raw) yield JSON.parse(raw);
      }
    } while (cursor !== '0');
  }

  /** Step 1 — purge everything past its TTL. */
  async function purgeExpired() {
    let purged = 0;
    for await (const job of scanJobs()) {
      if (job.purgedAt) continue;
      if (new Date(job.expiresAt).getTime() > Date.now()) continue;
      await purgeJobFiles(config, job.jobId);
      await jobstore.markPurged(job.jobId);
      purged += 1;
    }
    return purged;
  }

  /**
   * Step 2 — anything on disk with no live job record. The grace period keeps
   * us from deleting the upload of a job that is being created right now.
   */
  async function sweepOrphans() {
    const live = new Set();
    for await (const job of scanJobs()) {
      if (!job.purgedAt) live.add(job.jobId);
    }

    let orphans = 0;
    for (const root of [config.inDir, config.outDir, config.tmpDir]) {
      for (const entry of await listJobDirs(root)) {
        if (live.has(entry.name)) continue;
        const dir = path.join(root, entry.name);
        try {
          const stat = await fs.promises.stat(dir);
          if (Date.now() - stat.mtimeMs < config.reaper.orphanGraceMs) continue;
          await fs.promises.rm(dir, { recursive: true, force: true });
          orphans += 1;
        } catch (err) {
          logger.warn('reaper: could not remove orphan directory', { error: err.message });
        }
      }
    }
    return orphans;
  }

  /**
   * Step 3 — under disk pressure, drop the oldest job directories regardless of
   * TTL. Breaking one user's download is a far better outcome than filling the
   * disk out from under the other services on this box.
   */
  async function relieveDiskPressure(usedPercent) {
    const dirs = [];
    for (const root of [config.outDir, config.inDir, config.tmpDir]) {
      for (const entry of await listJobDirs(root)) {
        const dir = path.join(root, entry.name);
        try {
          const stat = await fs.promises.stat(dir);
          dirs.push({ dir, jobId: entry.name, mtimeMs: stat.mtimeMs });
        } catch {
          // raced with another purge
        }
      }
    }
    dirs.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Take the oldest quarter — enough to make room, not so much that a normal
    // spike wipes every in-flight job.
    const victims = dirs.slice(0, Math.max(1, Math.ceil(dirs.length / 4)));
    for (const victim of victims) {
      await purgeJobFiles(config, victim.jobId).catch(() => {});
      await jobstore.markPurged(victim.jobId).catch(() => {});
    }

    await alert.send(
      'disk-pressure',
      `storage is ${usedPercent}% full — purged ${victims.length} job directories early`,
    );
    return victims.length;
  }

  async function runOnce() {
    const purged = await purgeExpired();
    const orphans = await sweepOrphans();

    const usedPercent = await diskUsagePercent(config.storageRoot);
    let emergencyPurged = 0;
    if (usedPercent !== null) {
      if (usedPercent >= config.reaper.diskPurgePercent) {
        emergencyPurged = await relieveDiskPressure(usedPercent);
      } else if (usedPercent >= config.reaper.diskWarnPercent) {
        await alert.send('disk-warn', `storage is ${usedPercent}% full`);
      }
    }

    if (orphans > 10) {
      await alert.send('orphans', `${orphans} orphaned job directories swept — check for worker crashes`);
    }
    if (purged || orphans || emergencyPurged) {
      logger.info('reaper pass complete', { purged, orphans, emergencyPurged, usedPercent });
    }
    return { purged, orphans, emergencyPurged, usedPercent };
  }

  function start() {
    const timer = setInterval(() => {
      runOnce().catch((err) => logger.error('reaper pass failed', { error: err.message }));
    }, config.reaper.intervalMs);
    timer.unref();
    runOnce().catch((err) => logger.error('reaper pass failed', { error: err.message }));
    return () => clearInterval(timer);
  }

  return { runOnce, start, purgeExpired, sweepOrphans, diskUsagePercent };
}

module.exports = { createReaper, diskUsagePercent };
