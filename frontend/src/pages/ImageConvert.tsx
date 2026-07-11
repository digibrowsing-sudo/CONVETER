import { useState } from 'react';
import ToolPage from '../components/ToolPage';
import FormatPicker from '../components/FormatPicker';

export default function ImageConvert() {
  const [format, setFormat] = useState('jpg');
  const [quality, setQuality] = useState(85);

  return (
    <ToolPage
      tool="image-convert"
      heading="Image Converter"
      subtitle="Convert JPG, PNG, WebP, GIF, TIFF, BMP and HEIC images."
      metaTitle="Convert images online free (JPG, PNG, WebP) — FileForge"
      metaDescription="Convert images between JPG, PNG and WebP online for free. Adjust quality, keep orientation, fast and private."
      accept=".jpg,.jpeg,.png,.webp,.gif,.tiff,.bmp,.heic"
      actionLabel="Convert image"
      options={
        <div className="space-y-4">
          <FormatPicker
            label="Convert to"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'jpg', label: 'JPG' },
              { value: 'png', label: 'PNG' },
              { value: 'webp', label: 'WebP' },
            ]}
          />
          {format !== 'png' && (
            <label className="block">
              <span className="mb-2 flex items-center justify-between text-sm font-medium text-gray-700">
                Quality <span className="text-gray-500">{quality}</span>
              </span>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-blue-800"
              />
            </label>
          )}
        </div>
      }
      getConvertOptions={() => ({
        targetFormat: format,
        options: format === 'png' ? {} : { quality },
      })}
    />
  );
}
