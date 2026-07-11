// Typed client for the FileForge API.

export type ToolId =
  | 'doc-to-pdf'
  | 'pdf-to-word'
  | 'compress-pdf'
  | 'merge-pdf'
  | 'split-pdf'
  | 'image-convert';

export type JobState = 'queued' | 'processing' | 'completed' | 'failed';

export interface JobResult {
  outputName?: string;
  size?: number;
  originalSize?: number;
}

export interface JobStatus {
  status: JobState;
  progress: number;
  error?: string;
  downloadReady: boolean;
  result?: JobResult;
}

export interface ConvertOptions {
  targetFormat?: string;
  options?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const POLL_INTERVAL_MS = 1500;

const FALLBACK_MESSAGES: Record<number, string> = {
  413: 'File too large — please pick a smaller file.',
  429: 'Too many requests — try again in a few minutes.',
};

async function throwApiError(res: Response): Promise<never> {
  let message = FALLBACK_MESSAGES[res.status] ?? 'Something went wrong — please try again.';
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // non-JSON error body; keep the fallback message
  }
  throw new ApiError(message, res.status);
}

export async function uploadAndConvert(
  tool: ToolId,
  files: File[],
  opts: ConvertOptions = {},
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('tool', tool);
  if (opts.targetFormat) form.append('targetFormat', opts.targetFormat);
  if (opts.options && Object.keys(opts.options).length > 0) {
    form.append('options', JSON.stringify(opts.options));
  }
  if (tool === 'merge-pdf') {
    for (const file of files) form.append('files', file);
  } else {
    form.append('file', files[0]);
  }

  let res: Response;
  try {
    res = await fetch('/api/convert', { method: 'POST', body: form });
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0);
  }
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<{ jobId: string }>;
}

export async function getStatus(jobId: string): Promise<JobStatus> {
  let res: Response;
  try {
    res = await fetch(`/api/status/${jobId}`);
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0);
  }
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<JobStatus>;
}

/**
 * Poll job status every POLL_INTERVAL_MS until it completes or fails.
 * `cancel()` stops polling (e.g. when the component unmounts).
 */
export function pollStatus(
  jobId: string,
  onUpdate?: (status: JobStatus) => void,
): { promise: Promise<JobStatus>; cancel: () => void } {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;

  const promise = new Promise<JobStatus>((resolve, reject) => {
    const tick = async () => {
      if (cancelled) return;
      try {
        const status = await getStatus(jobId);
        if (cancelled) return;
        onUpdate?.(status);
        if (status.status === 'completed' || status.status === 'failed') {
          resolve(status);
          return;
        }
      } catch (err) {
        if (!cancelled) reject(err);
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
    },
  };
}

export function downloadUrl(jobId: string): string {
  return `/api/download/${jobId}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
