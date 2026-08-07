'use strict';

// Server-side PDF operations: compress (Ghostscript) and encrypt / decrypt /
// repair (qpdf).
//
// Merge, split, extract, remove, reorder and rotate are deliberately absent:
// they are Tier C and run in the browser, so they cost us nothing and the
// file never leaves the user's device (ADR-002).

const fs = require('fs');
const path = require('path');
const exec = require('../../utils/exec');
const {
  PROGRESS,
  conversionError,
  fromEngineFailure,
  outDirFor,
  tmpDirFor,
  renameExt,
  fileSize,
  requireOutput,
} = require('./common');

// qpdf exits 3 when it produced output but had warnings — for Repair that is
// precisely the successful case.
const QPDF_WARNINGS = 3;

/**
 * Passwords must not appear in argv, where any user on the box could read them
 * out of `ps`. qpdf accepts `@file` to read its arguments from a file instead,
 * so the password lives in a 0600 file inside the job's tmp directory for the
 * length of one call and is deleted immediately afterwards.
 */
async function withArgFile(tmpDir, lines, fn) {
  const argFile = path.join(tmpDir, `qpdf-args-${Date.now()}`);
  await fs.promises.writeFile(argFile, lines.join('\n') + '\n', { mode: 0o600 });
  try {
    return await fn(argFile);
  } finally {
    await fs.promises.rm(argFile, { force: true });
  }
}

async function compressPdf(job, { config, jobstore, logger }) {
  const { jobId, files, options } = job;
  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const level = options.level || config.gsDefaultPreset;
  const outputPath = path.join(outDir, 'result.pdf');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await exec.run(
      'gs',
      [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=/${level}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dSAFER',
        `-sOutputFile=${outputPath}`,
        input.path,
      ],
      { timeoutMs: config.retry.S1.timeoutMs, memoryLimitKb: config.engineMemoryLimitKb },
    );
  } catch (err) {
    logger.error('ghostscript failed', { jobId, timedOut: Boolean(err.timedOut), exitCode: err.exitCode });
    throw fromEngineFailure(err, {
      timeoutMessage: 'Compression timed out — this PDF may be very large.',
      failureMessage: 'This PDF could not be compressed — it may be damaged.',
    });
  }

  const size = await requireOutput(outputPath, 'This PDF could not be compressed.');
  const warnings = [];
  // Compression that makes a file bigger is a real outcome on text-only PDFs,
  // and saying so is better than handing back a worse file without comment.
  if (size >= input.size) {
    warnings.push(
      'This PDF was already well optimised — the compressed version is not smaller, so you may prefer the original.',
    );
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, '.pdf', '-compressed'),
    size,
    originalSize: input.size,
    warnings,
  };
}

async function protectPdf(job, { config, jobstore, logger }) {
  const { jobId, files, options } = job;
  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const tmpDir = await tmpDirFor(config, jobId);
  const outputPath = path.join(outDir, 'result.pdf');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await withArgFile(
      tmpDir,
      [
        '--encrypt',
        `--user-password=${options.password}`,
        `--owner-password=${options.password}`,
        '--bits=256',
        '--',
        input.path,
        outputPath,
      ],
      (argFile) =>
        exec.run('qpdf', [`@${argFile}`], {
          timeoutMs: config.retry.S1.timeoutMs,
          memoryLimitKb: config.engineMemoryLimitKb,
          allowExitCodes: [QPDF_WARNINGS],
        }),
    );
  } catch (err) {
    logger.error('qpdf encrypt failed', { jobId, exitCode: err.exitCode });
    throw fromEngineFailure(err, {
      timeoutMessage: 'Encryption timed out — this PDF may be very large.',
      failureMessage: 'This PDF could not be encrypted — it may be damaged.',
    });
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, '.pdf', '-protected'),
    size: await requireOutput(outputPath, 'This PDF could not be encrypted.'),
    warnings: ['Keep a copy of the original. A PDF whose password is lost cannot be recovered.'],
  };
}

async function unlockPdf(job, { config, jobstore, logger }) {
  const { jobId, files, options } = job;
  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const tmpDir = await tmpDirFor(config, jobId);
  const outputPath = path.join(outDir, 'result.pdf');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await withArgFile(
      tmpDir,
      [`--password=${options.password}`, '--decrypt', input.path, outputPath],
      (argFile) =>
        exec.run('qpdf', [`@${argFile}`], {
          timeoutMs: config.retry.S1.timeoutMs,
          memoryLimitKb: config.engineMemoryLimitKb,
          allowExitCodes: [QPDF_WARNINGS],
        }),
    );
  } catch (err) {
    // qpdf exit 2 with this message is a wrong password, not a broken file.
    if (/invalid password/i.test(String(err.stderr || ''))) {
      logger.info('unlock rejected: wrong password', { jobId });
      throw conversionError(
        'ENCRYPTED_INPUT',
        'That password did not open this PDF. Check it and try again — PDF passwords are case sensitive.',
      );
    }
    logger.error('qpdf decrypt failed', { jobId, exitCode: err.exitCode });
    throw fromEngineFailure(err, {
      timeoutMessage: 'Decryption timed out — this PDF may be very large.',
      failureMessage: 'This PDF could not be unlocked — it may be damaged.',
    });
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, '.pdf', '-unlocked'),
    size: await requireOutput(outputPath, 'This PDF could not be unlocked.'),
  };
}

async function repairPdf(job, { config, jobstore, logger }) {
  const { jobId, files } = job;
  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const outputPath = path.join(outDir, 'result.pdf');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  let result;
  try {
    // Rewriting the file through qpdf rebuilds the cross-reference table and
    // object streams, which is what "repair" actually means here.
    result = await exec.run('qpdf', ['--linearize', input.path, outputPath], {
      timeoutMs: config.retry.S1.timeoutMs,
      memoryLimitKb: config.engineMemoryLimitKb,
      allowExitCodes: [QPDF_WARNINGS],
    });
  } catch (err) {
    logger.error('qpdf repair failed', { jobId, exitCode: err.exitCode });
    throw conversionError(
      'CORRUPT_INPUT',
      'This PDF is damaged beyond what we can rebuild. If you still have the original source, re-export it.',
    );
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, '.pdf', '-repaired'),
    size: await requireOutput(outputPath, 'This PDF could not be repaired.'),
    originalSize: input.size,
    warnings:
      result.exitCode === QPDF_WARNINGS
        ? ['The file was rebuilt but had structural warnings. Check that every page is present.']
        : [],
  };
}

const HANDLERS = {
  'compress-pdf': compressPdf,
  'protect-pdf': protectPdf,
  'unlock-pdf': unlockPdf,
  'repair-pdf': repairPdf,
};

function process(job, ctx) {
  const handler = HANDLERS[job.toolSlug];
  if (!handler) throw new Error(`pdf.worker cannot handle "${job.toolSlug}"`);
  return handler(job, ctx);
}

module.exports = { tools: Object.keys(HANDLERS), process };
