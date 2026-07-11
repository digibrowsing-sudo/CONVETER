import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import UploadBox from './UploadBox';
import ProgressBar from './ProgressBar';
import DownloadCard from './DownloadCard';
import {
  ApiError,
  pollStatus,
  uploadAndConvert,
  type ConvertOptions,
  type JobResult,
  type ToolId,
} from '../lib/api';
import { usePageMeta } from '../lib/usePageMeta';

type Phase = 'idle' | 'working' | 'done' | 'error';

interface ToolPageProps {
  tool: ToolId;
  heading: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  accept: string;
  multiple?: boolean;
  minFiles?: number;
  actionLabel: string;
  /** Tool-specific options UI, rendered between the upload box and the button. */
  options?: ReactNode;
  /** Called at convert time to collect targetFormat / options for the API. */
  getConvertOptions?: () => ConvertOptions;
}

export default function ToolPage({
  tool,
  heading,
  subtitle,
  metaTitle,
  metaDescription,
  accept,
  multiple = false,
  minFiles = 1,
  actionLabel,
  options,
  getConvertOptions,
}: ToolPageProps) {
  usePageMeta(metaTitle, metaDescription);

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelPollRef.current?.(), []);

  async function convert() {
    setPhase('working');
    setProgress(5);
    setStatusText('Uploading…');
    setError(null);
    try {
      const { jobId: id } = await uploadAndConvert(tool, files, getConvertOptions?.() ?? {});
      setJobId(id);
      const { promise, cancel } = pollStatus(id, (s) => {
        setProgress(Math.max(10, s.progress));
        setStatusText(s.status === 'queued' ? 'Waiting in queue…' : 'Converting…');
      });
      cancelPollRef.current = cancel;
      const final = await promise;
      if (final.status === 'completed') {
        setResult(final.result ?? {});
        setProgress(100);
        setPhase('done');
      } else {
        setError(final.error ?? 'Conversion failed — please try again.');
        setPhase('error');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong — please try again.',
      );
      setPhase('error');
    }
  }

  function reset() {
    cancelPollRef.current?.();
    setFiles([]);
    setPhase('idle');
    setProgress(0);
    setStatusText('');
    setError(null);
    setJobId(null);
    setResult(null);
  }

  const canConvert = files.length >= minFiles && phase !== 'working';

  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-6 text-sm">
        <Link to="/" className="text-primary hover:underline">
          ← All tools
        </Link>
      </nav>
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">{heading}</h1>
        <p className="mt-2 text-gray-600">{subtitle}</p>
      </header>

      <div className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
        {phase === 'done' && jobId && result ? (
          <DownloadCard jobId={jobId} result={result} onReset={reset} />
        ) : (
          <>
            <UploadBox
              accept={accept}
              multiple={multiple}
              files={files}
              onFiles={setFiles}
              disabled={phase === 'working'}
            />

            {files.length > 0 && options}

            {phase === 'error' && error && (
              <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {phase === 'working' ? (
              <ProgressBar progress={progress} statusText={statusText} />
            ) : (
              <button
                type="button"
                onClick={convert}
                disabled={!canConvert}
                className="w-full rounded-lg bg-primary px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {actionLabel}
              </button>
            )}

            {multiple && files.length > 0 && files.length < minFiles && (
              <p className="text-center text-sm text-gray-500">
                Add at least {minFiles} files to continue.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
