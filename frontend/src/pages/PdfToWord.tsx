import ToolPage from '../components/ToolPage';

export default function PdfToWord() {
  return (
    <ToolPage
      tool="pdf-to-word"
      heading="PDF to Word"
      subtitle="Turn a PDF into an editable Word (.docx) document."
      metaTitle="Convert PDF to Word online free — FileForge"
      metaDescription="Convert PDF files to editable Word DOCX documents online for free. Keeps text and layout. Fast and private."
      accept=".pdf"
      actionLabel="Convert to Word"
    />
  );
}
