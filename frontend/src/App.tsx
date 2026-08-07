import { Link, Route, Routes } from 'react-router-dom';

import Home from './pages/Home';
import Finance from './pages/Finance';
import ToolPage from './components/ToolPage';
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import Security from './pages/legal/Security';
import Refund from './pages/legal/Refund';
import Contact from './pages/legal/Contact';
import Dmca from './pages/legal/Dmca';

import { CATEGORY_LABELS, TOOLS, toolPath, toolsByCategory } from './tools/registry';
import { usePageMeta } from './lib/seo';

const LEGAL_LINKS = [
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/security', label: 'Security' },
  { to: '/refund', label: 'Refunds' },
  { to: '/contact', label: 'Contact' },
  { to: '/dmca', label: 'Takedown' },
];

function NotFound() {
  usePageMeta({
    title: 'Page not found — FileForge',
    description: 'That page does not exist.',
    path: '/404',
    noIndex: true,
  });

  return (
    <div className="py-24 text-center">
      <h1 className="text-3xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-2 text-gray-600">That tool does not exist, or has moved.</p>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        See all tools
      </Link>
    </div>
  );
}

/**
 * Every tool page links to every other one (spec 14.3). It is the cheapest
 * internal linking there is, and on a site of this size it costs one screen of
 * footer to give each page a route in from everywhere else.
 */
function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {toolsByCategory().map((group) => (
            <div key={group.category}>
              <h2 className="text-sm font-semibold text-gray-900">
                {CATEGORY_LABELS[group.category]}
              </h2>
              <ul className="mt-3 space-y-1.5">
                {group.tools.map((tool) => (
                  <li key={tool.slug}>
                    <Link to={toolPath(tool)} className="text-sm text-gray-500 hover:text-primary">
                      {tool.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-gray-100 pt-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Files are deleted within an hour — 15 minutes for finance documents. Most tools never
            upload anything at all.
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-primary">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-white">
              F
            </span>
            <span className="text-lg font-bold text-gray-900">FileForge</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/finance" className="font-medium text-gray-700 hover:text-primary">
              Finance tools
            </Link>
            <Link to="/security" className="hidden text-gray-500 hover:text-primary sm:block">
              Security
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/finance" element={<Finance />} />

          {/* One route per tool, generated from the registry — adding a tool to
              shared/tools.json is all it takes to publish its page. */}
          {TOOLS.map((tool) => (
            <Route key={tool.slug} path={toolPath(tool)} element={<ToolPage tool={tool} />} />
          ))}

          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/security" element={<Security />} />
          <Route path="/refund" element={<Refund />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/dmca" element={<Dmca />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <SiteFooter />
    </div>
  );
}
