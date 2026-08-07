import { Link } from 'react-router-dom';
import ToolCard from '../components/ToolCard';
import {
  CATEGORY_LABELS,
  FINANCE_TOOLS,
  TOOLS,
  toolPath,
  toolsByCategory,
} from '../tools/registry';
import { SITE_URL, breadcrumbLd, usePageMeta } from '../lib/seo';

const browserToolCount = TOOLS.filter((tool) => tool.tier === 'C').length;

export default function Home() {
  usePageMeta({
    title: 'FileForge — PDF and document tools that do not upload your files',
    description:
      'Merge, split, rotate, compress and convert PDFs, images and Office documents. Most tools run entirely in your browser, so the file never leaves your device. Free, no sign-up.',
    path: '/',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'FileForge',
        url: SITE_URL,
        description:
          'Browser-based PDF and document conversion, with a specialised module for Indian financial documents.',
      },
      breadcrumbLd([{ name: 'FileForge', path: '/' }]),
    ],
  });

  return (
    <div>
      <section className="py-12 text-center sm:py-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          File tools that <span className="text-primary">do not upload your files</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">
          {browserToolCount} of our tools run entirely inside your browser — merging, splitting and
          rotating a PDF never sends it anywhere. The rest are converted on our servers over HTTPS
          and deleted within the hour. Free, no sign-up, no watermarks.
        </p>
      </section>

      <section className="mb-12 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Indian financial documents</h2>
            <p className="mt-1 max-w-xl text-gray-600">
              Bank statements, GST invoices and Form 26AS turned into clean spreadsheets — with
              confidence scoring, Tally-ready output, and a 15-minute retention limit.
            </p>
          </div>
          <Link
            to="/finance"
            className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark"
          >
            Open the finance tools
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {FINANCE_TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              to={toolPath(tool)}
              className="rounded-lg bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-blue-50 hover:text-primary"
            >
              {tool.name}
            </Link>
          ))}
        </div>
      </section>

      {toolsByCategory()
        .filter((group) => group.category !== 'finance')
        .map((group) => (
          <section key={group.category} className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              {CATEGORY_LABELS[group.category]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.tools.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
