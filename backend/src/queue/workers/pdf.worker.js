'use strict';

// PDF operations: compress (Ghostscript), merge (qpdf), split (qpdf + zip).

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const exec = require('../../utils/exec');
const { PROGRESS, ConversionError, ensureOutDir, renameExt, fileSize } = require('./common');

// Page ranges qpdf understands: "3", "1-5", "7-z" (z = last page).
const PAGE_RANGE_RE = /^(\d+|z)(-(\d+|z))?$/;

async function compressPdf(job, ctx) {
  const { config, jobstore, logger } = ctx;
  const { jobId, inputs, options } = job.data;
  const input = inputs[0];
  const outDir = await ensureOutDir(config, jobId);

  const preset = config.gsPresets.includes(options.compressionLevel)
    ? options.compressionLevel
    : config.gsDefaultPreset;
  const outputPath = path.join(outDir, renameExt(path.basename(input.path), '.pdf', '-compressed'));

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    await exec.run(
      'gs',
      [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=/${preset}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${outputPath}`,
        input.path,
      ],
      { timeoutMs: config.jobTimeoutMs },
    );
  } catch (err) {
    logger.error('ghostscript failed', { jobId, error: err.message, stderr: err.stderr });
    throw new ConversionError(
      err.timedOut
        ? 'Compression timed out — the PDF may be too large.'
        : 'This PDF could not be compressed — it may be corrupted or password-protected.',
    );
  }

  return {
    outputPath,
    outputName: renameExt(input.originalName, '.pdf', '-compressed'),
    size: await fileSize(outputPath),
    originalSize: input.size,
  };
}

async function mergePdf(job, ctx) {
  const { config, jobstore, logger } = ctx;
  const { jobId, inputs } = job.data;
  const outDir = await ensureOutDir(config, jobId);
  const outputPath = path.join(outDir, 'merged.pdf');

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    // Upload order is preserved: inputs[] keeps the order files were sent.
    await exec.run(
      'qpdf',
      ['--empty', '--pages', ...inputs.map((i) => i.path), '--', outputPath],
      { timeoutMs: config.jobTimeoutMs },
    );
  } catch (err) {
    logger.error('qpdf merge failed', { jobId, error: err.message, stderr: err.stderr });
    throw new ConversionError(
      'These PDFs could not be merged — one of them may be corrupted or password-protected.',
    );
  }

  return {
    outputPath,
    outputName: 'merged.pdf',
    size: await fileSize(outputPath),
  };
}

async function pageCount(inputPath, config) {
  const { stdout } = await exec.run('qpdf', ['--show-npages', inputPath], {
    timeoutMs: config.jobTimeoutMs,
  });
  return Number.parseInt(stdout.trim(), 10);
}

function parseRanges(options) {
  if (options.pages === undefined || options.pages === '') return null;
  const ranges = String(options.pages)
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (ranges.length === 0 || !ranges.every((r) => PAGE_RANGE_RE.test(r))) {
    throw new ConversionError(
      'Invalid page range — use numbers and dashes, e.g. "1-3,7".',
    );
  }
  return ranges;
}

async function zipFiles(files, zipPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const file of files) archive.file(file.path, { name: file.name });
    archive.finalize();
  });
}

async function splitPdf(job, ctx) {
  const { config, jobstore, logger } = ctx;
  const { jobId, inputs, options } = job.data;
  const input = inputs[0];
  const outDir = await ensureOutDir(config, jobId);
  const baseName = path.basename(input.originalName, path.extname(input.originalName));

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);

  // Requested ranges, or one file per page when none were given.
  let ranges = parseRanges(options);
  try {
    if (!ranges) {
      const pages = await pageCount(input.path, config);
      ranges = Array.from({ length: pages }, (_, i) => String(i + 1));
    }

    const parts = [];
    for (const range of ranges) {
      const partPath = path.join(outDir, `pages-${range}.pdf`);
      await exec.run('qpdf', [input.path, '--pages', '.', range, '--', partPath], {
        timeoutMs: config.jobTimeoutMs,
      });
      parts.push({ path: partPath, name: `${baseName}-pages-${range}.pdf` });
    }

    if (parts.length === 1) {
      return {
        outputPath: parts[0].path,
        outputName: parts[0].name,
        size: await fileSize(parts[0].path),
      };
    }

    const zipPath = path.join(outDir, `${jobId}.zip`);
    await zipFiles(parts, zipPath);
    return {
      outputPath: zipPath,
      outputName: `${baseName}-split.zip`,
      size: await fileSize(zipPath),
    };
  } catch (err) {
    if (err instanceof ConversionError) throw err;
    logger.error('qpdf split failed', { jobId, error: err.message, stderr: err.stderr });
    throw new ConversionError(
      'This PDF could not be split — check the page range and that the file is not password-protected.',
    );
  }
}

async function process(job, ctx) {
  switch (job.data.tool) {
    case 'compress-pdf':
      return compressPdf(job, ctx);
    case 'merge-pdf':
      return mergePdf(job, ctx);
    case 'split-pdf':
      return splitPdf(job, ctx);
    default:
      throw new Error(`pdf.worker cannot handle tool ${job.data.tool}`);
  }
}

module.exports = { tools: ['compress-pdf', 'merge-pdf', 'split-pdf'], process };
