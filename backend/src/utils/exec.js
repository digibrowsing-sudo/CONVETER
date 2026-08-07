'use strict';

// Safe wrapper around child_process.execFile (spec 12.4).
//
// Rules this file enforces, so that no caller has to remember them:
//   - arguments are always an array and no shell is ever spawned, so a
//     filename can never be interpreted as shell syntax
//   - a wall-clock timeout, always
//   - an address-space ceiling via prlimit, so a malformed input that sends
//     LibreOffice into an allocation loop cannot OOM the whole box
//   - a minimal environment: engines inherit PATH and locale, nothing else

const { execFile } = require('child_process');
const fsSync = require('fs');

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const PRLIMIT = '/usr/bin/prlimit';

let prlimitAvailable = null;

function hasPrlimit() {
  if (prlimitAvailable === null) {
    prlimitAvailable = fsSync.existsSync(PRLIMIT);
  }
  return prlimitAvailable;
}

/**
 * A deliberately small environment. Passing the API process's own environment
 * to a converter would hand it DOWNLOAD_SIGNING_SECRET, REDIS_URL and every
 * other secret in the process.
 */
function engineEnv(extra = {}) {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    ...extra,
  };
}

/**
 * Run an external command under a wall-clock and memory cap.
 *
 * @param {string} command binary to execute (no shell)
 * @param {string[]} args arguments, passed verbatim
 * @param {{timeoutMs?: number, cwd?: string, env?: object, memoryLimitKb?: number,
 *   allowExitCodes?: number[]}} [opts]
 *   allowExitCodes lets a caller accept a non-zero status that still produced
 *   usable output — qpdf exits 3 when it repaired a file but had warnings.
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function run(command, args, opts = {}) {
  const { timeoutMs = 120_000, cwd, env, memoryLimitKb, allowExitCodes = [] } = opts;

  // prlimit takes an argument array too, so wrapping keeps the no-shell rule.
  let realCommand = command;
  let realArgs = args;
  if (memoryLimitKb && hasPrlimit()) {
    realCommand = PRLIMIT;
    realArgs = [`--as=${memoryLimitKb * 1024}`, '--', command, ...args];
  }

  return new Promise((resolve, reject) => {
    execFile(
      realCommand,
      realArgs,
      {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        cwd,
        env: engineEnv(env),
        windowsHide: true,
        shell: false,
      },
      (err, stdout, stderr) => {
        if (err) {
          const timedOut = err.killed && err.signal === 'SIGKILL';
          if (!timedOut && allowExitCodes.includes(err.code)) {
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), exitCode: err.code });
            return;
          }
          const error = new Error(
            timedOut ? `${command} timed out after ${timeoutMs / 1000}s` : `${command} failed: ${err.message}`,
          );
          error.command = command;
          error.timedOut = timedOut;
          error.exitCode = err.code;
          error.stdout = String(stdout || '');
          error.stderr = String(stderr || '');
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), exitCode: 0 });
      },
    );
  });
}

module.exports = { run, engineEnv, hasPrlimit };
