import { useState } from 'react';
import { deleteJob, formatBytes, type FinanceMeta } from '../lib/api';
import { isFinance, type ToolDef } from '../tools/registry';

export interface ResultData {
  filename: string;
  bytes: number;
  originalBytes?: number;
  /** Server jobs give a signed URL; browser jobs give an object URL. */
  href: string;
  /** Set for server jobs, so the file can be deleted before its TTL. */
  jobId?: string;
  /** Finance output is deleted the instant it is downloaded (spec 10.2). */
  singleUse?: boolean;
  summary?: string;
  warnings?: string[];
  meta?: FinanceMeta;
}

interface ResultPanelProps {
  tool: ToolDef;
  result: ResultData;
  onReset: () => void;
}

function savingsLabel(bytes: number, originalBytes?: number): string | null {
  if (!originalBytes || originalBytes <= 0) return null;
  const saved = Math.round((1 - bytes / originalBytes) * 100);
  if (saved <= 0) return null;
  return `${saved}% smaller than the original`;
}

export default function ResultPanel({ tool, result, onReset }: ResultPanelProps) {
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const savings = savingsLabel(result.bytes, result.originalBytes);
  const confidence = result.meta?.confidence;

  async function handleDelete() {
    if (!result.jobId) return;
    setDeleting(true);
    try {
      await deleteJob(result.jobId);
      setDeleted(true);
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-semibold text-gray-900">Deleted.</p>
        <p className="text-sm text-gray-600">
          The file has been removed from our servers. Nothing was kept.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-lg bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-dark"
        >
          Convert another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
          ✓
        </div>
        <h2 className="text-xl font-bold text-gray-900">Done</h2>
        <p className="mt-1 break-all text-sm text-gray-600">{result.filename}</p>
        <p className="mt-1 text-sm text-gray-500">
          {formatBytes(result.bytes)}
          {result.summary ? ` · ${result.summary}` : ''}
          {savings ? ` · ${savings}` : ''}
        </p>
      </div>

      {/* Spec 15.9: the accuracy disclaimer belongs here, where the person is
          about to act on the data — not only buried in the Terms. */}
      {tool.disclaimer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Check this before you file it</p>
          <p className="mt-1 leading-relaxed">{tool.disclaimer}</p>
        </div>
      )}

      {result.meta && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
          {result.meta.bankCode && (
            <div>
              <dt className="text-gray-500">Format detected</dt>
              <dd className="font-semibold text-gray-900">{result.meta.bankCode}</dd>
            </div>
          )}
          {result.meta.rowsParsed !== null && (
            <div>
              <dt className="text-gray-500">Rows extracted</dt>
              <dd className="font-semibold text-gray-900">{result.meta.rowsParsed}</dd>
            </div>
          )}
          {confidence !== null && confidence !== undefined && (
            <div>
              <dt className="text-gray-500">Confidence</dt>
              <dd
                className={`font-semibold ${confidence >= 0.9 ? 'text-emerald-700' : 'text-amber-700'}`}
              >
                {Math.round(confidence * 100)}%
              </dd>
            </div>
          )}
        </dl>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <ul className="space-y-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {result.warnings.map((warning) => (
            <li key={warning} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

      {result.singleUse && !downloaded && (
        <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
          This file is deleted the moment you download it. Save it somewhere before you close the
          tab — you will need to convert again otherwise.
        </p>
      )}

      <a
        href={result.href}
        download={result.filename}
        onClick={() => setDownloaded(true)}
        className="block w-full rounded-lg bg-primary px-6 py-3 text-center font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
      >
        Download {isFinance(tool) ? 'file' : result.filename.split('.').pop()?.toUpperCase()}
      </a>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button type="button" onClick={onReset} className="text-primary hover:underline">
          Convert another file
        </button>
        {/* Spec 7.4: a visible delete button. It is a trust feature first and a
            compliance one second. */}
        {result.jobId && !result.singleUse && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-gray-500 hover:text-red-600 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete from our servers now'}
          </button>
        )}
        {!result.jobId && (
          <span className="text-gray-400">Nothing was uploaded, so there is nothing to delete.</span>
        )}
      </div>
    </div>
  );
}
