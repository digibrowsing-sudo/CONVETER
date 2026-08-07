// Main-thread entry point for the Tier C engines.
//
// The worker and pdf.js are both loaded on first use, never in the initial
// bundle — a tool page that nobody drops a file onto should not have paid for
// a PDF library (spec 9.5).

import { EngineError, type EngineResult, type ProgressFn } from './types';
import type { WorkerRequest } from './worker';

let worker: Worker | null = null;
let nextRequestId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

/** Engines that live in the worker, keyed by the registry's `engine` field. */
const WORKER_ENGINES = new Set([
  'merge',
  'split',
  'extract',
  'remove',
  'organize',
  'rotate',
  'imagesToPdf',
  'imageConvert',
]);

function runInWorker(
  engine: string,
  files: File[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  return new Promise((resolve, reject) => {
    Promise.all(
      files.map(async (file) => ({ name: file.name, buffer: await file.arrayBuffer() })),
    ).then((inputs) => {
      const id = nextRequestId++;
      const instance = getWorker();

      const onMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.id !== id) return;

        if (message.type === 'progress') {
          onProgress(message.value);
          return;
        }

        instance.removeEventListener('message', onMessage);
        if (message.type === 'done') {
          resolve({
            blob: message.blob,
            filename: message.filename,
            summary: message.summary,
            warnings: message.warnings,
          });
        } else {
          reject(new EngineError(message.message, message.retryOnServer));
        }
      };

      instance.addEventListener('message', onMessage);

      const request: WorkerRequest = { id, engine, inputs, options };
      // The ArrayBuffers are transferred rather than copied: a 100 MB merge
      // would otherwise be duplicated in memory before any work started.
      instance.postMessage(
        request,
        inputs.map((input) => input.buffer),
      );
    }, reject);
  });
}

/**
 * Run a Tier C engine. `engineName` is the part of the registry's `engine`
 * field after "client:".
 */
export async function runClientEngine(
  engineName: string,
  files: File[],
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<EngineResult> {
  if (files.length === 0) throw new EngineError('Add a file first.');

  if (WORKER_ENGINES.has(engineName)) {
    return runInWorker(engineName, files, options, onProgress);
  }
  if (engineName === 'pdfToImages') {
    const { pdfToImages } = await import('./render');
    return pdfToImages(files, options, onProgress);
  }
  throw new EngineError('This tool is not available.');
}

/** Read the engine name out of a registry entry: "client:merge" -> "merge". */
export function clientEngineName(engine: string): string | null {
  return engine.startsWith('client:') ? engine.slice('client:'.length) : null;
}

export { EngineError };
export type { EngineResult };
