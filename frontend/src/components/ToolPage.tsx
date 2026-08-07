import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import UploadBox from './UploadBox';
import ProgressBar from './ProgressBar';
import ResultPanel, { type ResultData } from './ResultPanel';
import ToolOptions, { apiOptions, defaultOptions, type OptionValues } from './ToolOptions';
import PrivacyNote from './PrivacyNote';
import Faq from './Faq';
import RelatedTools from './RelatedTools';
import ConsentCheckbox from './ConsentCheckbox';

import { ApiError, createJob, formatDuration, pollJob, type Job } from '../lib/api';
import { EngineError, clientEngineName, runClientEngine } from '../engines/client';
import {
  acceptAttribute,
  isFinance,
  relatedTools,
  runsInBrowser,
  toolPath,
  type ToolDef,
} from '../tools/registry';
import {
  breadcrumbLd,
  faqPageLd,
  howToLd,
  softwareApplicationLd,
  usePageMeta,
} from '../lib/seo';

type Phase = 'idle' | 'working' | 'done' | 'error';

/** Steps for the how-to block and its HowTo structured data (spec 9.2). */
function howToSteps(tool: ToolDef): string[] {
  const accepts = tool.acceptExts.join(', ');
  const steps = [
    tool.maxFiles > 1
      ? `Drop your ${accepts} files into the box above, or click to browse. Drag them into the order you want.`
      : `Drop your ${accepts} file into the box above, or click to browse.`,
  ];

  const optionStep: Record<string, string> = {
    'split-pdf': 'Enter the page ranges you want, or leave the box empty to get one file per page.',
    'extract-pages': 'Type the pages to keep, for example 2,5,9-12.',
    'remove-pages': 'Type the pages to delete, for example 1,4,8-10.',
    'organize-pdf': 'Type the page numbers in the order you want them.',
    'rotate-pdf': 'Choose the angle, and the pages to rotate if it is not all of them.',
    'jpg-to-pdf': 'Choose A4, US Letter, or a page that matches each image exactly.',
    'pdf-to-jpg': 'Choose JPG or PNG and the resolution you need.',
    'image-convert': 'Choose the output format and, for JPG or WebP, the quality.',
    'compress-pdf': 'Choose how hard to compress: strong for email, light to keep it printable.',
    'protect-pdf': 'Enter the password you want to set, and keep a copy of the original.',
    'unlock-pdf': 'Enter the password you use to open the PDF.',
    'bank-statement-to-excel': 'Leave the bank on automatic unless the result looks wrong.',
    'bank-statement-to-tally': 'Leave the bank on automatic unless the result looks wrong.',
  };
  if (optionStep[tool.slug]) steps.push(optionStep[tool.slug]);
  if (tool.requiresConsent) {
    steps.push('Tick the consent box to confirm you are happy for the document to be processed.');
  }

  steps.push(`Click "${actionLabel(tool)}".`);
  steps.push(
    runsInBrowser(tool)
      ? 'Download the result. Nothing was uploaded, so there is nothing for us to delete.'
      : 'Download the result, or delete it from our servers straight away.',
  );
  return steps;
}

function actionLabel(tool: ToolDef): string {
  const labels: Record<string, string> = {
    'merge-pdf': 'Merge PDFs',
    'split-pdf': 'Split PDF',
    'extract-pages': 'Extract pages',
    'remove-pages': 'Remove pages',
    'organize-pdf': 'Reorder pages',
    'rotate-pdf': 'Rotate PDF',
    'jpg-to-pdf': 'Create PDF',
    'pdf-to-jpg': 'Convert to images',
    'image-convert': 'Convert image',
  };
  return labels[tool.slug] ?? `Convert to ${tool.name.split(' to ').pop()}`;
}

export default function ToolPage({ tool }: { tool: ToolDef }) {
  const local = runsInBrowser(tool);
  const finance = isFinance(tool);

  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<OptionValues>(() => defaultOptions(tool));
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offerServer, setOfferServer] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);

  const cancelPollRef = useRef<(() => void) | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const steps = useMemo(() => howToSteps(tool), [tool]);
  const related = useMemo(() => relatedTools(tool), [tool]);

  usePageMeta({
    title: tool.seo.title,
    description: tool.seo.description,
    path: toolPath(tool),
    jsonLd: [
      softwareApplicationLd(tool),
      faqPageLd(tool),
      howToLd(tool, steps),
      breadcrumbLd([
        { name: 'FileForge', path: '/' },
        ...(finance ? [{ name: 'Finance documents', path: '/finance' }] : []),
        { name: tool.name, path: toolPath(tool) },
      ]),
    ],
  });

  useEffect(
    () => () => {
      cancelPollRef.current?.();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  // Options are per-tool, so switching tools must not carry the old ones over.
  useEffect(() => {
    setOptions(defaultOptions(tool));
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.slug]);

  function reset() {
    cancelPollRef.current?.();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFiles([]);
    setPhase('idle');
    setProgress(0);
    setStatusText('');
    setError(null);
    setOfferServer(false);
    setResult(null);
    setConsent(false);
  }

  async function runOnServer() {
    setOfferServer(false);
    setPhase('working');
    setProgress(5);
    setError(null);
    setStatusText('Uploading…');

    try {
      const job = await createJob(tool.slug, {
        files,
        options: apiOptions(tool, options),
        consent,
      });

      if (job.estimatedSeconds && job.estimatedSeconds > 20) {
        setStatusText(`Busy — about ${formatDuration(job.estimatedSeconds)} to go`);
      }

      const { promise, cancel } = pollJob(job.jobId, (update: Job) => {
        setProgress(Math.max(10, update.progress));
        setStatusText(update.status === 'queued' ? 'Waiting in the queue…' : 'Converting…');
      });
      cancelPollRef.current = cancel;

      const final = await promise;
      if (final.status === 'completed' && final.download) {
        setResult({
          filename: final.download.filename,
          bytes: final.download.bytes,
          originalBytes: final.originalBytes,
          href: final.download.url,
          jobId: final.jobId,
          singleUse: final.singleUse,
          warnings: final.warnings,
          meta: final.meta,
        });
        setProgress(100);
        setPhase('done');
      } else {
        setError(final.error?.message ?? 'Conversion failed. Please try again.');
        setPhase('error');
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      );
      setPhase('error');
    }
  }

  async function runInBrowser() {
    setPhase('working');
    setProgress(2);
    setError(null);
    setStatusText('Working in your browser…');

    const engineName = clientEngineName(tool.engine);
    try {
      const engineResult = await runClientEngine(engineName!, files, options, (fraction) =>
        setProgress(Math.max(2, Math.round(fraction * 100))),
      );

      const href = URL.createObjectURL(engineResult.blob);
      objectUrlRef.current = href;
      setResult({
        filename: engineResult.filename,
        bytes: engineResult.blob.size,
        originalBytes: files.reduce((sum, file) => sum + file.size, 0),
        href,
        summary: engineResult.summary,
        warnings: engineResult.warnings,
      });
      setProgress(100);
      setPhase('done');
    } catch (caught) {
      const message =
        caught instanceof EngineError ? caught.message : 'Something went wrong. Please try again.';
      setError(message);
      // Spec 9.4 — never dead-end. If the server could do what this browser
      // could not, offer that instead of leaving the user stuck.
      setOfferServer(caught instanceof EngineError && caught.retryOnServer && !!tool.fallbackTier);
      setPhase('error');
    }
  }

  const needsConsent = Boolean(tool.requiresConsent) && !consent;
  const canConvert =
    files.length >= (tool.slug === 'merge-pdf' ? 2 : 1) && !needsConsent && phase !== 'working';

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
        <Link to="/" className="text-primary hover:underline">
          All tools
        </Link>
        {finance && (
          <>
            <span className="px-2">/</span>
            <Link to="/finance" className="text-primary hover:underline">
              Finance
            </Link>
          </>
        )}
        <span className="px-2">/</span>
        <span>{tool.name}</span>
      </nav>

      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{tool.seo.h1}</h1>
        <div className="mt-4">
          <PrivacyNote tool={tool} />
        </div>
      </header>

      <div className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
        {phase === 'done' && result ? (
          <ResultPanel tool={tool} result={result} onReset={reset} />
        ) : (
          <>
            <UploadBox
              accept={acceptAttribute(tool)}
              maxFiles={tool.maxFiles}
              maxBytes={tool.maxBytes}
              files={files}
              onFiles={setFiles}
              disabled={phase === 'working'}
              orderable={tool.maxFiles > 1}
            />

            {files.length > 0 && (
              <ToolOptions
                tool={tool}
                values={options}
                onChange={setOptions}
                disabled={phase === 'working'}
              />
            )}

            {files.length > 0 && tool.requiresConsent && (
              <ConsentCheckbox
                tool={tool}
                checked={consent}
                onChange={setConsent}
                disabled={phase === 'working'}
              />
            )}

            {phase === 'error' && error && (
              <div role="alert" className="space-y-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
                <p>{error}</p>
                {offerServer && (
                  <button
                    type="button"
                    onClick={runOnServer}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                  >
                    Try on our servers instead
                  </button>
                )}
              </div>
            )}

            {phase === 'working' ? (
              <ProgressBar progress={progress} statusText={statusText} />
            ) : (
              <button
                type="button"
                onClick={local ? runInBrowser : runOnServer}
                disabled={!canConvert}
                className="w-full rounded-lg bg-primary px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {actionLabel(tool)}
              </button>
            )}

            {tool.slug === 'merge-pdf' && files.length === 1 && (
              <p className="text-center text-sm text-gray-500">Add at least one more PDF to merge.</p>
            )}
          </>
        )}
      </div>

      {tool.disclaimer && phase !== 'done' && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {tool.disclaimer}
        </p>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900">How to {tool.seo.h1.toLowerCase()}</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-gray-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <Faq entries={tool.seo.faq} />
      <RelatedTools tools={related} />
    </div>
  );
}
