import type { ReactNode } from 'react';
import ToolCard from '../components/ToolCard';
import { usePageMeta } from '../lib/usePageMeta';

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const TOOLS: { to: string; title: string; description: string; icon: ReactNode }[] = [
  {
    to: '/word-to-pdf',
    title: 'Word to PDF',
    description: 'Convert Word, Excel, PowerPoint and other documents to PDF.',
    icon: <Icon d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />,
  },
  {
    to: '/pdf-to-word',
    title: 'PDF to Word',
    description: 'Turn PDFs into editable Word documents.',
    icon: <Icon d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 12 3 3m0 0 3-3m-3 3v-6m-1.5 9H5.625c-.621 0-1.125-.504-1.125-1.125V4.125C4.5 3.504 5.004 3 5.625 3h5.25a9 9 0 0 1 9 9v8.25c0 .621-.504 1.125-1.125 1.125h-7.5Z" />,
  },
  {
    to: '/compress-pdf',
    title: 'Compress PDF',
    description: 'Shrink PDF size while keeping quality.',
    icon: <Icon d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />,
  },
  {
    to: '/merge-pdf',
    title: 'Merge PDF',
    description: 'Combine multiple PDFs into a single file.',
    icon: <Icon d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.03.75.057 1.123.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />,
  },
  {
    to: '/split-pdf',
    title: 'Split PDF',
    description: 'Extract pages or split a PDF into separate files.',
    icon: <Icon d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" />,
  },
  {
    to: '/image-converter',
    title: 'Image Converter',
    description: 'Convert between JPG, PNG and WebP with quality control.',
    icon: <Icon d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />,
  },
];

export default function Home() {
  usePageMeta(
    'FileForge — Convert any file in seconds',
    'Free online file converter: Word to PDF, PDF to Word, compress, merge and split PDFs, and convert images. Fast and private.',
  );

  return (
    <div>
      <section className="py-12 text-center sm:py-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Convert any file <span className="text-primary">in seconds</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
          Free tools for documents, PDFs and images. No sign-up, no watermarks —
          files are deleted automatically after an hour.
        </p>
      </section>

      <section className="grid gap-5 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.to} {...tool} />
        ))}
      </section>
    </div>
  );
}
