'use strict';

// doc-to-pdf: office documents -> PDF via headless LibreOffice.

const fs = require('fs');
const path = require('path');
const os = require('os');
const exec = require('../../utils/exec');
const { PROGRESS, ConversionError, ensureOutDir, renameExt, fileSize } = require('./common');

async function process(job, { config, jobstore, logger }) {
  const { jobId, inputs } = job.data;
  const input = inputs[0];
  const outDir = await ensureOutDir(config, jobId);

  // Each job gets its own LibreOffice profile so parallel jobs don't
  // collide on the profile lock.
  const profileDir = path.join(os.tmpdir(), `lo_${jobId}`);

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await exec.run(
      'libreoffice',
      [
        `-env:UserInstallation=file://${profileDir}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        outDir,
        input.path,
      ],
      { timeoutMs: config.jobTimeoutMs },
    );
  } catch (err) {
    logger.error('libreoffice conversion failed', { jobId, error: err.message, stderr: err.stderr });
    throw new ConversionError(
      err.timedOut
        ? 'Conversion timed out — the document may be too large or complex.'
        : 'This document could not be converted to PDF.',
    );
  } finally {
    fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  // LibreOffice names the output after the input file.
  const expected = path.join(
    outDir,
    `${path.basename(input.path, path.extname(input.path))}.pdf`,
  );
  let outputPath = expected;
  try {
    await fs.promises.access(outputPath);
  } catch {
    const produced = (await fs.promises.readdir(outDir)).find((f) => f.endsWith('.pdf'));
    if (!produced) {
      throw new ConversionError('This document could not be converted to PDF.');
    }
    outputPath = path.join(outDir, produced);
  }

  return {
    outputPath,
    outputName: renameExt(input.originalName, '.pdf'),
    size: await fileSize(outputPath),
  };
}

module.exports = { tools: ['doc-to-pdf'], process };
