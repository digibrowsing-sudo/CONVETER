'use strict';

// Tier F — the finance module (spec 2.2). This is the revenue product, and it
// is the only worker that handles documents we treat as sensitive personal
// data under the DPDP Act.
//
// Two rules govern everything here:
//   1. The Python side returns metadata only — bank code, row count, confidence.
//      No transaction, name, account number or balance ever crosses back into
//      Node, so none of it can reach a log or the job record (spec 6, 12.7).
//   2. Output is deleted 15 minutes after conversion, or the instant it is
//      downloaded, whichever comes first (spec 10.2, enforced in routes/download).

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

const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'python', 'finance', 'run.py');

// Slug -> what to ask the Python side for.
const JOBS = {
  'bank-statement-to-excel': { docType: 'bank_statement', format: 'xlsx', suffix: '-transactions' },
  'bank-statement-to-tally': { docType: 'bank_statement', format: 'csv', suffix: '-tally' },
  'gst-invoice-to-excel': { docType: 'gst_invoice', format: 'xlsx', suffix: '-invoice' },
  'form-26as-to-excel': { docType: 'form_26as', format: 'xlsx', suffix: '-26as' },
};

// Codes the parser may return, mapped onto our public error table (spec 7.6).
const PARSER_ERROR_CODES = new Set([
  'BANK_UNSUPPORTED',
  'CORRUPT_INPUT',
  'ENCRYPTED_INPUT',
  'CONVERSION_FAILED',
]);

function parseParserOutput(stdout) {
  const line = String(stdout || '')
    .trim()
    .split('\n')
    .pop();
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function process(job, { config, jobstore, logger }) {
  const { jobId, files, options, toolSlug } = job;
  const spec = JOBS[toolSlug];
  if (!spec) throw new Error(`finance.worker cannot handle "${toolSlug}"`);

  const input = files[0];
  const outDir = await outDirFor(config, jobId);
  const outputPath = path.join(outDir, `result.${spec.format}`);

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);

  const args = [
    SCRIPT,
    '--doc-type',
    spec.docType,
    '--input',
    input.path,
    '--output',
    outputPath,
    '--format',
    spec.format,
  ];
  if (options.bank && options.bank !== 'auto') args.push('--bank', options.bank);

  let stdout;
  try {
    ({ stdout } = await exec.run('python3', args, {
      timeoutMs: config.retry.F.timeoutMs,
      memoryLimitKb: config.engineMemoryLimitKb,
    }));
  } catch (err) {
    const failure = parseParserOutput(err.stdout);
    if (failure && PARSER_ERROR_CODES.has(failure.code)) {
      logger.info('finance parse rejected', { jobId, toolSlug, code: failure.code });
      throw conversionError(failure.code, failure.message);
    }
    logger.error('finance parser failed', {
      jobId,
      toolSlug,
      timedOut: Boolean(err.timedOut),
      exitCode: err.exitCode,
    });
    throw fromEngineFailure(err, {
      timeoutMessage: 'This statement took too long to read. Try a shorter date range.',
      failureMessage: 'This document could not be read. Check that it is a text PDF rather than a scan.',
    });
  }

  const result = parseParserOutput(stdout);
  if (!result || result.ok !== true) {
    throw conversionError('CONVERSION_FAILED', 'This document could not be read.');
  }

  await jobstore.setProgress(jobId, PROGRESS.PACKAGING);

  // Metadata only — this is everything we are willing to know about the
  // document, and it is also all that finance_jobs would ever store.
  const meta = {
    docType: spec.docType,
    bankCode: result.bank_code || null,
    rowsParsed: result.rows_parsed ?? null,
    confidence: result.confidence ?? null,
  };

  logger.info('finance job parsed', { jobId, toolSlug, ...meta });

  return {
    outputPath,
    outputName: renameExt(input.displayName, `.${spec.format}`, spec.suffix),
    size: await requireOutput(outputPath, 'This document could not be converted.'),
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    meta,
  };
}

module.exports = { tools: Object.keys(JOBS), process };
