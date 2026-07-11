'use strict';

// image-convert: raster images -> jpg/png/webp via sharp.

const path = require('path');
const sharp = require('sharp');
const { PROGRESS, ConversionError, ensureOutDir, renameExt, fileSize } = require('./common');

function clampQuality(value, fallback) {
  const q = Number.parseInt(value, 10);
  if (!Number.isFinite(q)) return fallback;
  return Math.min(100, Math.max(1, q));
}

async function process(job, { config, jobstore, logger }) {
  const { jobId, inputs, targetFormat, options } = job.data;
  const input = inputs[0];
  const outDir = await ensureOutDir(config, jobId);
  const outputPath = path.join(outDir, renameExt(path.basename(input.path), `.${targetFormat}`));
  const quality = clampQuality(options.quality, config.imageDefaultQuality);

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    // .rotate() with no args applies the EXIF orientation, preserving how
    // the photo was meant to be viewed.
    const pipeline = sharp(input.path).rotate();
    switch (targetFormat) {
      case 'jpg':
        pipeline.jpeg({ quality });
        break;
      case 'png':
        pipeline.png({ compressionLevel: 9 });
        break;
      case 'webp':
        pipeline.webp({ quality });
        break;
      default:
        throw new Error(`unsupported targetFormat ${targetFormat}`);
    }
    await pipeline.toFile(outputPath);
  } catch (err) {
    logger.error('sharp conversion failed', { jobId, error: err.message });
    throw new ConversionError(
      'This image could not be converted — it may be corrupted or use an unsupported codec (HEIC needs libheif on the server).',
    );
  }

  return {
    outputPath,
    outputName: renameExt(input.originalName, `.${targetFormat}`),
    size: await fileSize(outputPath),
    originalSize: input.size,
  };
}

module.exports = { tools: ['image-convert'], process };
