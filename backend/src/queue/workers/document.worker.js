'use strict';

// Office documents -> PDF via headless LibreOffice.
// Serves word-to-pdf, excel-to-pdf and powerpoint-to-pdf: the engine is the
// same, the three slugs exist because they are three different search queries.

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
} = require('./common');

async function process(job, { config, jobstore, logger }) {
  const { jobId, files, toolSlug } = job;
  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const tmpDir = await tmpDirFor(config, jobId);

  // Each job gets its own LibreOffice profile: two soffice processes sharing
  // one profile directory deadlock on the profile lock.
  const profileDir = path.join(tmpDir, 'lo-profile');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await exec.run(
      'libreoffice',
      [
        `-env:UserInstallation=file://${profileDir}`,
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--convert-to',
        'pdf',
        '--outdir',
        outDir,
        input.path,
      ],
      { timeoutMs: config.retry.S2.timeoutMs, memoryLimitKb: config.engineMemoryLimitKb },
    );
  } catch (err) {
    // stderr can echo document content, so it is logged at debug level only in
    // development and never in production (spec 13.1).
    logger.error('libreoffice conversion failed', {
      jobId,
      toolSlug,
      timedOut: Boolean(err.timedOut),
      exitCode: err.exitCode,
    });
    throw fromEngineFailure(err, {
      timeoutMessage: 'Conversion timed out — the document may be very large or complex.',
      failureMessage: 'This document could not be converted to PDF.',
    });
  }

  // LibreOffice names its output after the input file, which we renamed to
  // original-0.ext, so the expected name is predictable.
  const expected = path.join(outDir, `${path.basename(input.path, path.extname(input.path))}.pdf`);
  let outputPath = expected;
  try {
    await fs.promises.access(outputPath);
  } catch {
    const produced = (await fs.promises.readdir(outDir)).find((name) => name.endsWith('.pdf'));
    if (!produced) throw conversionError('CONVERSION_FAILED', 'This document could not be converted to PDF.');
    outputPath = path.join(outDir, produced);
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, '.pdf'),
    size: await fileSize(outputPath),
  };
}

module.exports = { tools: ['word-to-pdf', 'excel-to-pdf', 'powerpoint-to-pdf'], process };
