import { isFinance, runsInBrowser, type ToolDef } from '../tools/registry';

/**
 * The trust line under the H1. It states exactly what happens to the file, and
 * it differs by tier because the truth differs by tier — a badge that claimed
 * "private" on a tool that uploads would be the fastest way to lose the one
 * advantage we actually have.
 */
export default function PrivacyNote({ tool }: { tool: ToolDef }) {
  if (runsInBrowser(tool)) {
    return (
      <p className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        <span aria-hidden="true">🔒</span>
        <span>
          <strong className="font-semibold">Your file never leaves your device.</strong> This
          conversion runs in your browser — open the network tab and check.
        </span>
      </p>
    );
  }

  if (isFinance(tool)) {
    return (
      <p className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm text-blue-900">
        <span aria-hidden="true">🔒</span>
        <span>
          Deleted <strong className="font-semibold">15 minutes</strong> after conversion, or the
          moment you download it. Nothing from the document is ever stored.
        </span>
      </p>
    );
  }

  return (
    <p className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700">
      <span aria-hidden="true">🔒</span>
      <span>
        Free, no sign-up. Converted on our servers over HTTPS and deleted within an hour.
      </span>
    </p>
  );
}
