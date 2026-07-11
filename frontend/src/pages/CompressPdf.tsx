import { useState } from 'react';
import ToolPage from '../components/ToolPage';
import FormatPicker from '../components/FormatPicker';

export default function CompressPdf() {
  const [level, setLevel] = useState('ebook');

  return (
    <ToolPage
      tool="compress-pdf"
      heading="Compress PDF"
      subtitle="Shrink PDF file size while keeping the best possible quality."
      metaTitle="Compress PDF online free — FileForge"
      metaDescription="Reduce PDF file size online for free. Choose your compression level and download a smaller PDF in seconds."
      accept=".pdf"
      actionLabel="Compress PDF"
      options={
        <FormatPicker
          label="Compression level"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'screen', label: 'Extreme', hint: 'smallest file' },
            { value: 'ebook', label: 'Recommended', hint: 'good quality' },
            { value: 'printer', label: 'High quality', hint: 'light compression' },
          ]}
        />
      }
      getConvertOptions={() => ({ options: { compressionLevel: level } })}
    />
  );
}
