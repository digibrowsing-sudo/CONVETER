// Contract every Tier C engine implements (spec 9.3).
//
// The UI is identical whether a tool runs here or on the server, so the tier is
// an implementation detail everywhere except the one place it should be loud:
// the badge that tells the user their file is not being uploaded.

export interface EngineResult {
  blob: Blob;
  filename: string;
  /** Shown in the result panel — e.g. "12 pages", "3 files". */
  summary?: string;
  warnings?: string[];
}

export type ProgressFn = (fraction: number) => void;

export interface ClientEngine {
  run(files: File[], options: Record<string, unknown>, onProgress: ProgressFn): Promise<EngineResult>;
}

/**
 * A failure the user can act on. Anything else that escapes an engine is
 * treated as "this browser could not cope" and offers the server fallback
 * (spec 9.4) rather than dead-ending.
 */
export class EngineError extends Error {
  constructor(
    message: string,
    /** When false, offering "try on our servers" would not help. */
    readonly retryOnServer = false,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function baseName(filename: string): string {
  const withoutPath = filename.split(/[\\/]/).pop() ?? filename;
  const dot = withoutPath.lastIndexOf('.');
  return dot > 0 ? withoutPath.slice(0, dot) : withoutPath;
}
