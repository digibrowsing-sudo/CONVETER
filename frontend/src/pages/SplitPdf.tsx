import { useState } from 'react';
import ToolPage from '../components/ToolPage';

export default function SplitPdf() {
  const [pages, setPages] = useState('');

  return (
    <ToolPage
      tool="split-pdf"
      heading="Split PDF"
      subtitle="Extract page ranges from a PDF, or split every page into its own file."
      metaTitle="Split PDF online free — FileForge"
      metaDescription="Split a PDF online for free: extract page ranges like 1-3,7 or get every page as a separate PDF in a zip."
      accept=".pdf"
      actionLabel="Split PDF"
      options={
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            Pages to extract <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            type="text"
            value={pages}
            onChange={(e) => setPages(e.target.value)}
            placeholder='e.g. "1-3,7" — leave empty to split every page'
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Each range becomes its own PDF; multiple files are zipped.
          </span>
        </label>
      }
      getConvertOptions={() => (pages.trim() ? { options: { pages: pages.trim() } } : {})}
    />
  );
}
