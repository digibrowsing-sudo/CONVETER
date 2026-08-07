'use strict';

// pdf-to-word: PDF -> DOCX via the Python pdf2docx package.
//
// LibreOffice is poor at this direction, which is why a second engine exists
// for it at all (ADR-005). Paths are passed through argv to a script on disk —
// never interpolated into Python source — so a filename cannot inject code.

const path = require('path');
const exec = require('../../utils/exec');
const {
  PROGRESS,
  conversionError,
  fromEngineFailure,
  outDirFor,
  renameExt,
  requireOutput,
} = require('./common');

const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'python', 'pdf_to_docx.py');

async function process(job, { config, jobstore, logger }) {
  const { jobId, files } = job;
  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const outputPath = path.join(outDir, 'result.docx');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await exec.run('python3', [SCRIPT, input.path, outputPath], {
      timeoutMs: config.retry.S2.timeoutMs,
      memoryLimitKb: config.engineMemoryLimitKb,
    });
  } catch (err) {
    logger.error('pdf2docx failed', { jobId, timedOut: Boolean(err.timedOut), exitCode: err.exitCode });
    if (/no extractable text/i.test(String(err.stderr || ''))) {
      throw conversionError(
        'CORRUPT_INPUT',
        'This PDF has no extractable text — it looks like a scan. Converting a scan needs OCR, which we do not offer yet.',
      );
    }
    throw fromEngineFailure(err, {
      timeoutMessage: 'Conversion timed out — this PDF may be very long or very complex.',
      failureMessage: 'This PDF could not be converted to Word.',
    });
  }

  const warnings = [];
  if (input.pages && input.pages > 50) {
    warnings.push('Long documents often need some tidying up in Word — check the tables and page breaks.');
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, '.docx'),
    size: await requireOutput(outputPath, 'This PDF could not be converted to Word.'),
    warnings,
  };
}

module.exports = { tools: ['pdf-to-word'], process };
