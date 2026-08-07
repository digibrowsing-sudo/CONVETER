// Client for the v1 API (spec 7).
//
// Only server-side tools (S1, S2, F) come through here. Tier C tools never
// touch it, which is the whole point of them.

export type JobState = 'queued' | 'processing' | 'completed' | 'failed' | 'expired';

/** Stable error codes from spec 7.6. The UI switches on these, not on messages. */
export type ErrorCode =
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'UNSUPPORTED_TYPE'
  | 'ENCRYPTED_INPUT'
  | 'CORRUPT_INPUT'
  | 'RATE_LIMITED'
  | 'QUEUE_FULL'
  | 'CONVERSION_FAILED'
  | 'TIMEOUT'
  | 'JOB_EXPIRED'
  | 'BANK_UNSUPPORTED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'CONSENT_REQUIRED'
  | 'INTERNAL'
  | 'NETWORK';

export interface JobDownload {
  url: string;
  filename: string;
  bytes: number;
  expiresAt: string;
}

export interface FinanceMeta {
  docType: string;
  bankCode: string | null;
  rowsParsed: number | null;
  confidence: number | null;
}

export interface Job {
  jobId: string;
  tool: string;
  status: JobState;
  progress: number;
  expiresAt: string;
  queuePosition?: number;
  estimatedSeconds?: number;
  download?: JobDownload;
  warnings?: string[];
  meta?: FinanceMeta;
  originalBytes?: number;
  singleUse?: boolean;
  error?: { code: ErrorCode; message: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth offering a "try again" button for. */
  get transient(): boolean {
    return ['RATE_LIMITED', 'QUEUE_FULL', 'TIMEOUT', 'INTERNAL', 'NETWORK'].includes(this.code);
  }
}

export const POLL_INTERVAL_MS = 1500;

const BASE = '/api/v1';

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: ErrorCode; message?: string; retryAfterSeconds?: number } };
    if (body.error?.message) {
      return new ApiError(
        body.error.message,
        body.error.code ?? 'INTERNAL',
        res.status,
        body.error.retryAfterSeconds,
      );
    }
  } catch {
    // Not JSON — a proxy error page, most likely.
  }
  return new ApiError('Something went wrong. Please try again.', 'INTERNAL', res.status);
}

async function json<T>(promise: Promise<Response>): Promise<T> {
  let res: Response;
  try {
    res = await promise;
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 'NETWORK', 0);
  }
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<T>;
}

export interface CreateJobInput {
  files: File[];
  options?: Record<string, unknown>;
  /** Explicit, unbundled consent for the finance module (spec 15.2). */
  consent?: boolean;
}

export async function createJob(tool: string, input: CreateJobInput): Promise<Job> {
  const form = new FormData();
  form.append('tool', tool);
  if (input.options && Object.keys(input.options).length > 0) {
    form.append('options', JSON.stringify(input.options));
  }
  if (input.consent) form.append('consent', 'true');
  for (const file of input.files) form.append('files', file);

  // A double-clicked button must not cost two conversions (spec 8.4).
  const idempotencyKey = crypto.randomUUID();

  // The tool also goes in the query string: the server needs it before the
  // multipart body is parsed so it can apply the right size cap mid-upload.
  return json<Job>(
    fetch(`${BASE}/jobs?tool=${encodeURIComponent(tool)}`, {
      method: 'POST',
      body: form,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  );
}

export function getJob(jobId: string): Promise<Job> {
  return json<Job>(fetch(`${BASE}/jobs/${jobId}`));
}

/** Spec 7.4 — the user-facing "delete this now" button. */
export function deleteJob(jobId: string): Promise<{ jobId: string; status: string }> {
  return json(fetch(`${BASE}/jobs/${jobId}`, { method: 'DELETE' }));
}

/**
 * Poll until the job reaches a terminal state.
 * `cancel()` stops polling — call it when the component unmounts.
 */
export function pollJob(
  jobId: string,
  onUpdate?: (job: Job) => void,
): { promise: Promise<Job>; cancel: () => void } {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;

  const promise = new Promise<Job>((resolve, reject) => {
    const tick = async () => {
      if (cancelled) return;
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        onUpdate?.(job);
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'expired') {
          resolve(job);
          return;
        }
      } catch (error) {
        if (!cancelled) reject(error);
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  return `${Math.round(seconds / 60)} minute${seconds >= 120 ? 's' : ''}`;
}
