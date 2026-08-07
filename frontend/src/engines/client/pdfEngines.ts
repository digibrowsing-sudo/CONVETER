// Tier C PDF engines (spec 2.2). These run inside the Web Worker, so nothing
// here may touch the DOM — OffscreenCanvas only.
//
// Every one of these operations is a page-tree edit rather than a re-render:
// pages are copied across verbatim, so text stays selectable, images keep their
// resolution and the output is not degraded by the round trip.

import { PDFDocument, degrees } from 'pdf-lib';
import { EngineError, baseName, type EngineResult, type ProgressFn } from './types';
import { parseRanges, parseSelectionOrAll, expandRanges } from './pages';
import { createZip } from './zip';

export interface EngineInput {
  name: string;
  buffer: ArrayBuffer;
}

const PDF_MIME = 'application/pdf';

async function loadPdf(input: EngineInput): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(input.buffer);
  } catch (error) {
    const message = String((error as Error)?.message || '');
    if (/encrypt/i.test(message)) {
      throw new EngineError(
        'This PDF is password protected. Remove the password first with our Unlock PDF tool.',
      );
    }
    throw new EngineError(
      'This PDF could not be read — it may be damaged. Try our Repair PDF tool.',
    );
  }
}

async function toBlob(pdf: PDFDocument): Promise<Blob> {
  // useObjectStreams keeps the output compact, which matters most on the
  // merges that combine a dozen documents.
  const bytes = await pdf.save({ useObjectStreams: true });
  return new Blob([bytes], { type: PDF_MIME });
}

export async function merge(inputs: EngineInput[], onProgress: ProgressFn): Promise<EngineResult> {
  if (inputs.length < 2) throw new EngineError('Add at least two PDFs to merge.');

  const merged = await PDFDocument.create();
  let pageCount = 0;

  for (const [index, input] of inputs.entries()) {
    const source = await loadPdf(input);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    pageCount += pages.length;
    onProgress((index + 1) / (inputs.length + 1));
  }

  onProgress(0.95);
  return {
    blob: await toBlob(merged),
    filename: 'merged.pdf',
    summary: `${inputs.length} files, ${pageCount} pages`,
  };
}

export async function split(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const input = inputs[0];
  const source = await loadPdf(input);
  const pageCount = source.getPageCount();
  const base = baseName(input.name);

  const selection = String(options.pages || '').trim();
  // No selection means the other useful default: one file per page.
  const ranges = selection
    ? parseRanges(selection, pageCount)
    : Array.from({ length: pageCount }, (_, index) => ({
        from: index + 1,
        to: index + 1,
        label: String(index + 1),
      }));

  const parts: { name: string; data: Uint8Array }[] = [];
  for (const [index, range] of ranges.entries()) {
    const part = await PDFDocument.create();
    const indices = [];
    for (let page = range.from; page <= range.to; page += 1) indices.push(page - 1);
    const copied = await part.copyPages(source, indices);
    copied.forEach((page) => part.addPage(page));
    parts.push({ name: `${base}-pages-${range.label}.pdf`, data: await part.save() });
    onProgress((index + 1) / (ranges.length + 1));
  }

  if (parts.length === 1) {
    return {
      blob: new Blob([parts[0].data], { type: PDF_MIME }),
      filename: parts[0].name,
      summary: '1 file',
    };
  }

  onProgress(0.95);
  return {
    blob: createZip(parts.map((part) => ({ name: part.name, data: part.data }))),
    filename: `${base}-split.zip`,
    summary: `${parts.length} files`,
  };
}

/** Extract keeps the pages you list; remove keeps everything else. */
async function keepPages(
  input: EngineInput,
  pages: number[],
  suffix: string,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const source = await loadPdf(input);
  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    pages.map((page) => page - 1),
  );
  copied.forEach((page) => output.addPage(page));
  onProgress(0.9);

  return {
    blob: await toBlob(output),
    filename: `${baseName(input.name)}${suffix}.pdf`,
    summary: `${pages.length} page${pages.length === 1 ? '' : 's'}`,
  };
}

export async function extract(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const source = await loadPdf(inputs[0]);
  const pageCount = source.getPageCount();
  const pages = expandRanges(parseRanges(String(options.pages || ''), pageCount));
  return keepPages(inputs[0], pages, '-extracted', onProgress);
}

export async function remove(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const source = await loadPdf(inputs[0]);
  const pageCount = source.getPageCount();
  const drop = new Set(expandRanges(parseRanges(String(options.pages || ''), pageCount)));

  const keep = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (page) => !drop.has(page),
  );
  if (keep.length === 0) {
    throw new EngineError('That would remove every page. Leave at least one page in the document.');
  }
  return keepPages(inputs[0], keep, '-pages-removed', onProgress);
}

export async function organize(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const source = await loadPdf(inputs[0]);
  const pageCount = source.getPageCount();
  const order = expandRanges(parseRanges(String(options.order || ''), pageCount));

  const result = await keepPages(inputs[0], order, '-reordered', onProgress);
  const omitted = pageCount - new Set(order).size;
  return {
    ...result,
    warnings: omitted > 0 ? [`${omitted} page(s) were not listed and have been left out.`] : [],
  };
}

const ALLOWED_ANGLES = [90, 180, 270];

export async function rotate(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const angle = Number(options.angle ?? 90);
  if (!ALLOWED_ANGLES.includes(angle)) {
    throw new EngineError('Choose a rotation of 90, 180 or 270 degrees.');
  }

  const input = inputs[0];
  const pdf = await loadPdf(input);
  const targets = new Set(parseSelectionOrAll(String(options.pages || ''), pdf.getPageCount()));

  pdf.getPages().forEach((page, index) => {
    if (!targets.has(index + 1)) return;
    // Rotation is cumulative: a page already at 90 must end up at 180, not 90.
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  });
  onProgress(0.9);

  return {
    blob: await toBlob(pdf),
    filename: `${baseName(input.name)}-rotated.pdf`,
    summary: `${targets.size} page${targets.size === 1 ? '' : 's'} rotated ${angle}°`,
  };
}

// ------------------------------------------------------------------- images

const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/**
 * pdf-lib can embed JPEG and PNG directly. WebP has no PDF equivalent, so it is
 * re-encoded to PNG first — lossless, and it keeps any transparency.
 */
async function embedImage(pdf: PDFDocument, input: EngineInput) {
  const header = new Uint8Array(input.buffer.slice(0, 4));
  const isJpeg = header[0] === 0xff && header[1] === 0xd8;
  const isPng = header[0] === 0x89 && header[1] === 0x50;

  if (isJpeg) return pdf.embedJpg(input.buffer);
  if (isPng) return pdf.embedPng(input.buffer);

  const bitmap = await createImageBitmap(new Blob([input.buffer]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  return pdf.embedPng(await png.arrayBuffer());
}

export async function imagesToPdf(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const pdf = await PDFDocument.create();
  const sizeKey = String(options.pageSize || 'a4');
  const margin = sizeKey === 'fit' ? 0 : 36; // half an inch

  for (const [index, input] of inputs.entries()) {
    const image = await embedImage(pdf, input);

    if (sizeKey === 'fit') {
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    } else {
      const [pageWidth, pageHeight] = PAGE_SIZES[sizeKey] ?? PAGE_SIZES.a4;
      const landscape = image.width > image.height;
      const [width, height] = landscape ? [pageHeight, pageWidth] : [pageWidth, pageHeight];
      const page = pdf.addPage([width, height]);

      // Fit inside the margins without distorting the aspect ratio.
      const scale = Math.min(
        (width - margin * 2) / image.width,
        (height - margin * 2) / image.height,
      );
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      page.drawImage(image, {
        x: (width - drawWidth) / 2,
        y: (height - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
    }

    onProgress((index + 1) / (inputs.length + 1));
  }

  onProgress(0.95);
  const name = inputs.length === 1 ? `${baseName(inputs[0].name)}.pdf` : 'images.pdf';
  return {
    blob: await toBlob(pdf),
    filename: name,
    summary: `${inputs.length} image${inputs.length === 1 ? '' : 's'}`,
  };
}

const MIME_FOR_FORMAT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function imageConvert(
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const input = inputs[0];
  const format = String(options.targetFormat || 'jpg');
  const type = MIME_FOR_FORMAT[format];
  if (!type) throw new EngineError('Choose JPG, PNG or WebP.');

  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the EXIF orientation, so a phone photo comes out
    // the way it was taken.
    bitmap = await createImageBitmap(new Blob([input.buffer]), { imageOrientation: 'from-image' });
  } catch {
    // HEIC and TIFF have no browser decoder. This is exactly the case the
    // server fallback exists for (spec 9.4).
    throw new EngineError('Your browser cannot read this image format.', true);
  }
  onProgress(0.4);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  // JPEG has no alpha; without a white ground a transparent PNG turns black.
  if (format === 'jpg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  onProgress(0.7);

  const quality = Math.min(100, Math.max(1, Number(options.quality ?? 85))) / 100;
  const blob = await canvas.convertToBlob(
    format === 'png' ? { type } : { type, quality },
  );
  onProgress(0.95);

  return {
    blob,
    filename: `${baseName(input.name)}.${format}`,
    summary: `${canvas.width} × ${canvas.height}`,
  };
}
