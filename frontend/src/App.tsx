import { Link, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import DocToPdf from './pages/DocToPdf';
import PdfToWord from './pages/PdfToWord';
import CompressPdf from './pages/CompressPdf';
import MergePdf from './pages/MergePdf';
import SplitPdf from './pages/SplitPdf';
import ImageConvert from './pages/ImageConvert';

function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-3xl font-bold text-gray-900">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        ← Back to all tools
      </Link>
    </div>
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
          <span className="text-sm text-gray-500 hidden sm:block">
            Fast, private file conversion
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/word-to-pdf" element={<DocToPdf />} />
          <Route path="/pdf-to-word" element={<PdfToWord />} />
          <Route path="/compress-pdf" element={<CompressPdf />} />
          <Route path="/merge-pdf" element={<MergePdf />} />
          <Route path="/split-pdf" element={<SplitPdf />} />
          <Route path="/image-converter" element={<ImageConvert />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="border-t border-gray-100 bg-white py-6 text-center text-sm text-gray-500">
        FileForge — files are deleted automatically after 60 minutes.
      </footer>
    </div>
  );
}
