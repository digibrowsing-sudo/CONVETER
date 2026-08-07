import type { FaqEntry } from '../tools/registry';

/**
 * The FAQ block. Rendered as real markup rather than a JS accordion so the
 * answers are in the HTML for a crawler to read — the FAQPage structured data
 * is generated from the same registry entries in lib/seo.
 */
export default function Faq({ entries }: { entries: FaqEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900">Frequently asked questions</h2>
      <dl className="mt-4 divide-y divide-gray-100 rounded-xl bg-white ring-1 ring-gray-100">
        {entries.map((entry) => (
          <div key={entry.q} className="px-5 py-4">
            <dt className="font-semibold text-gray-900">{entry.q}</dt>
            <dd className="mt-1 leading-relaxed text-gray-600">{entry.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
