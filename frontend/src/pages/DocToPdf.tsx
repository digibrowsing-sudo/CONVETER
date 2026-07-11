import ToolPage from '../components/ToolPage';

export default function DocToPdf() {
  return (
    <ToolPage
      tool="doc-to-pdf"
      heading="Word to PDF"
      subtitle="Convert Word, Excel, PowerPoint and other office documents to PDF."
      metaTitle="Convert Word to PDF online free — FileForge"
      metaDescription="Convert Word, Excel, PowerPoint, ODT, RTF and TXT documents to PDF online for free. Fast, private, no watermark."
      accept=".doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ppt,.pptx"
      actionLabel="Convert to PDF"
    />
  );
}
