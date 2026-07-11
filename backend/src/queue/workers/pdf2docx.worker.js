'use strict';

// pdf-to-word: PDF -> DOCX via the Python pdf2docx package.
//
// Paths are passed through sys.argv, never interpolated into the Python
// source, so filenames cannot inject code.

const path = require('path');
const exec = require('../../utils/exec');
const { PROGRESS, ConversionError, ensureOutDir, renameExt, fileSize } = require('./common');

const PYTHON_SNIPPET =
  'import sys\n' +
  'from pdf2docx import Converter\n' +
  'c = Converter(sys.argv[1])\n' +
  'c.convert(sys.argv[2])\n' +
  'c.close()\n';

async function process(job, { config, jobstore, logger }) {
  const { jobId, inputs } = job.data;
  const input = inputs[0];
  const outDir = await ensureOutDir(config, jobId);
  const outputPath = path.join(outDir, renameExt(path.basename(input.path), '.docx'));

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await exec.run('python3', ['-c', PYTHON_SNIPPET, input.path, outputPath], {
      timeoutMs: config.jobTimeoutMs,
    });
    await fileSize(outputPath); // throws if pdf2docx silently produced nothing
  } catch (err) {
    logger.error('pdf2docx failed', { jobId, error: err.message, stderr: err.stderr });
    throw new ConversionError(
      err.timedOut
        ? 'Conversion timed out — the PDF may be too large or complex.'
        : 'This PDF could not be converted — it may be scanned or image-based.',
    );
  }

  return {
    outputPath,
    outputName: renameExt(input.originalName, '.docx'),
    size: await fileSize(outputPath),
  };
}

module.exports = { tools: ['pdf-to-word'], process };
