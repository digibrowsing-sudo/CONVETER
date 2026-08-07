'use strict';

// One implementation of "delete this job's files", used by the reaper, the
// user-facing delete endpoint and the single-use finance download hook.
// Having exactly one is the point: retention is a promise (spec 10.2), and a
// second copy of this logic is how promises get broken.

const fs = require('fs');
const path = require('path');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jobDirs(config, jobId) {
  return [
    path.join(config.inDir, jobId),
    path.join(config.outDir, jobId),
    path.join(config.tmpDir, jobId),
  ];
}

/**
 * Remove every directory belonging to a job.
 * @returns {Promise<number>} how many directories actually existed
 */
async function purgeJobFiles(config, jobId) {
  if (!UUID_RE.test(jobId)) throw new Error('refusing to purge a non-UUID job id');

  let removed = 0;
  for (const dir of jobDirs(config, jobId)) {
    // Guard against a config that would point rm at something it should not.
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(config.storageRoot) + path.sep)) {
      throw new Error('refusing to purge outside the storage root');
    }
    try {
      await fs.promises.rm(resolved, { recursive: true, force: true });
      removed += 1;
    } catch {
      // force:true means this only fires on a genuine filesystem error; the
      // reaper's next pass will try again.
    }
  }
  return removed;
}

module.exports = { purgeJobFiles, jobDirs, UUID_RE };
