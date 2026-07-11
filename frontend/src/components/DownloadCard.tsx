import { downloadUrl, formatBytes, type JobResult } from '../lib/api';

interface DownloadCardProps {
  jobId: string;
  result: JobResult;
  onReset: () => void;
}

export default function DownloadCard({ jobId, result, onReset }: DownloadCardProps) {
  const savings =
    result.originalSize && result.size && result.originalSize > 0
      ? Math.round((1 - result.size / result.originalSize) * 100)
      : null;

  return (
    <div className="rounded-xl bg-green-50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-7 w-7 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <p className="font-semibold text-gray-800">Your file is ready</p>
      {result.outputName && (
        <p className="mt-1 text-sm text-gray-600">
          {result.outputName}
          {result.size !== undefined && ` · ${formatBytes(result.size)}`}
        </p>
      )}
      {savings !== null && savings > 0 && (
        <p className="mt-1 text-sm font-medium text-green-700">
          {savings}% smaller ({formatBytes(result.originalSize!)} → {formatBytes(result.size!)})
        </p>
      )}
      <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
        <a
          href={downloadUrl(jobId)}
          download
          className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
        >
          Download
        </a>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Convert another
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">Files are deleted automatically after 60 minutes.</p>
    </div>
  );
}
