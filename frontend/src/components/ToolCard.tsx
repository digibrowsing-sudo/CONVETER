import { Link } from 'react-router-dom';
import { runsInBrowser, toolPath, type ToolDef } from '../tools/registry';

/**
 * A tool card in the homepage grid. The "in your browser" badge is the single
 * most important thing on this page (spec 14.5): none of the competitors can
 * make that claim, and it is what a user searching for privacy is looking for.
 */
export default function ToolCard({ tool }: { tool: ToolDef }) {
  const local = runsInBrowser(tool);

  return (
    <Link
      to={toolPath(tool)}
      className="group flex flex-col gap-2 rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 group-hover:text-primary">{tool.name}</h3>
        {local && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            No upload
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-gray-500">{tool.seo.description}</p>
    </Link>
  );
}
