// PDF -> images, using pdf.js.
//
// This one stays on the main thread because pdf.js runs its own worker for
// parsing and rendering; nesting it inside ours would buy nothing and is not
// supported everywhere. The heavy lifting is still off the UI thread.

import { EngineError, baseName, type EngineResult, type ProgressFn } from './types';
import { createZip, numbered } from './zip';

const MIME_FOR_FORMAT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png' };

// A PDF point is 1/72 inch, so the render scale is simply dpi / 72.
const POINTS_PER_INCH = 72;

export async function pdfToImages(
  files: File[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  const format = String(options.format || 'jpg');
  const type = MIME_FOR_FORMAT[format];
  if (!type) throw new EngineError('Choose JPG or PNG.');

  const dpi = Number(options.dpi ?? 150);
  const quality = format === 'jpg' ? 0.9 : undefined;

  // Loaded on first use, never in the initial bundle (spec 9.5).
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const file = files[0];
  const data = new Uint8Array(await file.arrayBuffer());

  let document;
  try {
    document = await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    if (/password/i.test(String((error as Error)?.message))) {
      throw new EngineError(
        'This PDF is password protected. Remove the password first with our Unlock PDF tool.',
      );
    }
    throw new EngineError('This PDF could not be read — it may be damaged.');
  }

  const base = baseName(file.name);
  const extension = `.${format}`;
  const images: { name: string; data: Uint8Array }[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / POINTS_PER_INCH });

    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new EngineError('Your browser could not create a canvas to render on.');

    // JPEG has no alpha, and an unpainted canvas renders as black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
    if (!blob) throw new EngineError('This page could not be rendered.');

    images.push({
      name: numbered(base, pageNumber, document.numPages, extension),
      data: new Uint8Array(await blob.arrayBuffer()),
    });

    // Free the bitmap straight away: a 300 DPI A4 page is ~35 MB in memory and
    // holding every page at once is what kills a long document.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    onProgress(pageNumber / (document.numPages + 1));
  }

  await document.destroy();
  onProgress(0.95);

  if (images.length === 1) {
    return {
      blob: new Blob([images[0].data], { type }),
      filename: images[0].name,
      summary: '1 page',
    };
  }

  return {
    blob: createZip(images),
    filename: `${base}-${format}.zip`,
    summary: `${images.length} pages`,
  };
}
