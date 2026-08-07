import { Link } from 'react-router-dom';
import ToolCard from '../components/ToolCard';
import { FINANCE_TOOLS } from '../tools/registry';
import { breadcrumbLd, usePageMeta } from '../lib/seo';

/**
 * The finance hub. This vertical is the business (ADR-008) — the generic tools
 * exist to prove the engineering and carry the traffic, this is where the
 * search competition is thin and the willingness to pay actually exists.
 */
export default function Finance() {
  usePageMeta({
    title: 'Indian financial documents to Excel — bank statements, GST invoices, 26AS',
    description:
      'Convert Indian bank statement PDFs to Excel or Tally-ready CSV, extract GST invoice line items, and turn Form 26AS into a usable sheet. Deleted 15 minutes after conversion.',
    path: '/finance',
    jsonLd: [
      breadcrumbLd([
        { name: 'FileForge', path: '/' },
        { name: 'Finance documents', path: '/finance' },
      ]),
    ],
  });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="py-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
          Indian financial documents, turned into spreadsheets
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">
          Built for bookkeepers and small practices: real numbers in real columns, flagged rows
          where the parser was unsure, and a retention window measured in minutes.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {FINANCE_TOOLS.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>

      <section className="mt-12 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">How we handle your documents</h2>

        <div className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Fifteen minutes, not an hour</h3>
            <p className="mt-1 leading-relaxed text-gray-600">
              Finance documents get a shorter retention window than everything else on the site, and
              the output is deleted the instant you download it.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Nothing from the document is stored</h3>
            <p className="mt-1 leading-relaxed text-gray-600">
              We record which bank format was detected, how many rows were read and how confident
              the parse was. There is no column in our database that could hold a transaction, a
              name, an account number or a balance — that is a schema constraint, not a policy.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">You are told what to check</h3>
            <p className="mt-1 leading-relaxed text-gray-600">
              Every extraction is scored on three independent signals, including whether the running
              balance is arithmetically consistent. Rows that fail are highlighted in the sheet
              itself. Automated extraction can misread a PDF, and the figures you file remain your
              responsibility.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Your bank is not listed?</h3>
            <p className="mt-1 leading-relaxed text-gray-600">
              HDFC, ICICI, SBI and Kotak have dedicated parsers, and a generic reader handles many
              other ruled-table statements.{' '}
              <Link to="/contact" className="text-primary underline">
                Tell us which bank you use
              </Link>{' '}
              and it goes on the list.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
