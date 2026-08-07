// Tier C engines run here rather than on the main thread (spec 9.3).
//
// Merging a 200-page document is a second or two of solid CPU. On the main
// thread that is a frozen tab and a progress bar that cannot move, which is
// indistinguishable from a crash. In a worker the UI stays responsive and the
// progress bar tells the truth.

import { EngineError } from './types';
import {
  extract,
  imageConvert,
  imagesToPdf,
  merge,
  organize,
  remove,
  rotate,
  split,
  type EngineInput,
} from './pdfEngines';

type EngineFn = (
  inputs: EngineInput[],
  options: Record<string, unknown>,
  onProgress: (fraction: number) => void,
) => Promise<{ blob: Blob; filename: string; summary?: string; warnings?: string[] }>;

const ENGINES: Record<string, EngineFn> = {
  merge: (inputs, _options, onProgress) => merge(inputs, onProgress),
  split,
  extract,
  remove,
  organize,
  rotate,
  imagesToPdf,
  imageConvert,
};

export interface WorkerRequest {
  id: number;
  engine: string;
  inputs: EngineInput[];
  options: Record<string, unknown>;
}

// Module-scoped, so it shadows the DOM lib's `self` without pulling the
// WebWorker lib in globally — which would collide with DOM everywhere else.
declare const self: {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, engine, inputs, options } = event.data;

  const post = (message: Record<string, unknown>) => self.postMessage({ id, ...message });

  const run = ENGINES[engine];
  if (!run) {
    post({ type: 'error', message: 'This tool is not available.', retryOnServer: false });
    return;
  }

  try {
    const result = await run(inputs, options, (fraction) =>
      post({ type: 'progress', value: Math.max(0, Math.min(1, fraction)) }),
    );
    post({
      type: 'done',
      blob: result.blob,
      filename: result.filename,
      summary: result.summary,
      warnings: result.warnings ?? [],
    });
  } catch (error) {
    const engineError = error instanceof EngineError;
    post({
      type: 'error',
      message: engineError
        ? (error as EngineError).message
        : 'Your browser ran out of memory on this file.',
      // An unexpected failure is usually a memory ceiling, and the server has
      // more of it — so offer the fallback rather than dead-ending (spec 9.4).
      retryOnServer: engineError ? (error as EngineError).retryOnServer : true,
    });
  }
};
