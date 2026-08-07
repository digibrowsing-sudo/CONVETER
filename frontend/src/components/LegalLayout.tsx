import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../lib/site';
import { breadcrumbLd, usePageMeta } from '../lib/seo';

interface LegalLayoutProps {
  title: string;
  description: string;
  path: string;
  heading: string;
  intro?: string;
  children: ReactNode;
}

export default function LegalLayout({
  title,
  description,
  path,
  heading,
  intro,
  children,
}: LegalLayoutProps) {
  usePageMeta({
    title,
    description,
    path,
    jsonLd: [
      breadcrumbLd([
        { name: 'FileForge', path: '/' },
        { name: heading, path },
      ]),
    ],
  });

  return (
    <article className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link to="/" className="text-primary hover:underline">
          All tools
        </Link>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900">{heading}</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated {SITE.lastUpdated}</p>
      {intro && <p className="mt-4 leading-relaxed text-gray-700">{intro}</p>}

      {/* Styling the prose here keeps every legal page consistent without a
          plugin, and without each page repeating a dozen class names. */}
      <div
        className="mt-8 space-y-6 leading-relaxed text-gray-700
          [&_a]:text-primary [&_a]:underline
          [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900
          [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-gray-900
          [&_li]:ml-5 [&_li]:list-disc
          [&_table]:w-full [&_table]:text-sm
          [&_td]:border-t [&_td]:border-gray-100 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top
          [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-900
          [&_ul]:space-y-1"
      >
        {children}
      </div>
    </article>
  );
}
