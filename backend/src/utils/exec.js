'use strict';

// Safe wrapper around child_process.execFile.
//
// SECURITY: arguments are always passed as an array and no shell is ever
// spawned, so filenames can never be interpreted as shell syntax.

const { execFile } = require('child_process');

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/**
 * Run an external command with a hard timeout.
 *
 * @param {string} command - binary to execute (no shell)
 * @param {string[]} args - arguments, passed verbatim
 * @param {{ timeoutMs?: number, cwd?: string, env?: object }} [opts]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function run(command, args, opts = {}) {
  const { timeoutMs = 120 * 1000, cwd, env } = opts;

  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        cwd,
        env,
        windowsHide: true,
        shell: false,
      },
      (err, stdout, stderr) => {
        if (err) {
          const timedOut = err.killed && err.signal === 'SIGKILL';
          const error = new Error(
            timedOut
              ? `${command} timed out after ${timeoutMs / 1000}s`
              : `${command} failed: ${err.message}`,
          );
          error.command = command;
          error.timedOut = timedOut;
          error.exitCode = err.code;
          error.stdout = String(stdout || '');
          error.stderr = String(stderr || '');
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      },
    );
  });
}

module.exports = { run };
