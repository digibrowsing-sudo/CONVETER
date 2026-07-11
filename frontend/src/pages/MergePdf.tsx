import ToolPage from '../components/ToolPage';

export default function MergePdf() {
  return (
    <ToolPage
      tool="merge-pdf"
      heading="Merge PDF"
      subtitle="Combine multiple PDFs into one file, in the order you add them."
      metaTitle="Merge PDF files online free — FileForge"
      metaDescription="Combine multiple PDF files into a single PDF online for free. Order is preserved. Fast and private."
      accept=".pdf"
      multiple
      minFiles={2}
      actionLabel="Merge PDFs"
    />
  );
}
