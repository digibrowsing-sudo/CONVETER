'use strict';

// image-convert, server side.
//
// This is the progressive fallback (spec 9.4), not the primary path: JPG, PNG,
// WebP, GIF and BMP are converted in the browser with Canvas and never reach
// us. HEIC and TIFF have no browser decoder, so those land here.

const path = require('path');
const sharp = require('sharp');
const { PROGRESS, conversionError, outDirFor, renameExt, requireOutput } = require('./common');

// A decompression bomb is a small file that decodes to an enormous bitmap.
// sharp has its own guard; this caps the pixel count we will even attempt.
const MAX_PIXELS = 100 * 1024 * 1024;

async function process(job, { config, jobstore, logger }) {
  const { jobId, files, options } = job;
  const input = files[0];
  const target = options.targetFormat;
  const outDir = await outDirFor(config, jobId);
  const outputPath = path.join(outDir, `result.${target}`);

  await jobstore.setProgress(jobId, PROGRESS.CONVERTING);
  try {
    // .rotate() with no argument applies the EXIF orientation, so the image
    // comes out the way it was taken. EXIF is otherwise dropped, which also
    // strips the GPS coordinates most phones write into a photo.
    const pipeline = sharp(input.path, { limitInputPixels: MAX_PIXELS }).rotate();

    switch (target) {
      case 'jpg':
        pipeline.jpeg({ quality: options.quality, mozjpeg: true });
        break;
      case 'png':
        pipeline.png({ compressionLevel: 9 });
        break;
      case 'webp':
        pipeline.webp({ quality: options.quality });
        break;
      default:
        throw conversionError('BAD_REQUEST', `Unsupported output format "${target}".`);
    }

    await pipeline.toFile(outputPath);
  } catch (err) {
    logger.error('sharp conversion failed', { jobId, toolSlug: job.toolSlug });
    if (/pixel|limit/i.test(err.message)) {
      throw conversionError('FILE_TOO_LARGE', 'This image is too large to convert safely.');
    }
    throw conversionError(
      'CORRUPT_INPUT',
      'This image could not be read — it may be damaged, or use a codec our server does not support.',
    );
  }

  return {
    outputPath,
    outputName: renameExt(input.displayName, `.${target}`),
    size: await requireOutput(outputPath, 'This image could not be converted.'),
    originalSize: input.size,
  };
}

module.exports = { tools: ['image-convert'], process };
