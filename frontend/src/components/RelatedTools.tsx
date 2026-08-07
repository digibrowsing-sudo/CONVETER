import { Link } from 'react-router-dom';
import { toolPath, type ToolDef } from '../tools/registry';

/** Part of the internal link web (spec 14.3); the slugs come from the registry. */
export default function RelatedTools({ tools }: { tools: ToolDef[] }) {
  if (tools.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900">Related tools</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.slug}
            to={toolPath(tool)}
            className="rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-gray-100 transition-colors hover:ring-primary"
          >
            <span className="font-semibold text-gray-900">{tool.name}</span>
            <span className="mt-0.5 block text-gray-500">{tool.seo.h1}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
