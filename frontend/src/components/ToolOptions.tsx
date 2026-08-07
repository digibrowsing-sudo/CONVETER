import FormatPicker from './FormatPicker';
import type { ToolDef } from '../tools/registry';

export type OptionValues = Record<string, unknown>;

interface ToolOptionsProps {
  tool: ToolDef;
  values: OptionValues;
  onChange: (patch: OptionValues) => void;
  disabled?: boolean;
}

/** Defaults are the values the API's Zod schemas would apply anyway. */
export function defaultOptions(tool: ToolDef): OptionValues {
  switch (tool.slug) {
    case 'rotate-pdf':
      return { angle: 90, pages: '' };
    case 'split-pdf':
      return { pages: '' };
    case 'extract-pages':
    case 'remove-pages':
      return { pages: '' };
    case 'organize-pdf':
      return { order: '' };
    case 'jpg-to-pdf':
      return { pageSize: 'a4' };
    case 'pdf-to-jpg':
      return { format: 'jpg', dpi: 150 };
    case 'image-convert':
      return { targetFormat: 'jpg', quality: 85 };
    case 'compress-pdf':
      return { level: 'ebook' };
    case 'protect-pdf':
    case 'unlock-pdf':
      return { password: '' };
    case 'bank-statement-to-excel':
    case 'bank-statement-to-tally':
      return { bank: 'auto' };
    default:
      return {};
  }
}

/** Client-side tools that must not send their UI-only fields to the API. */
export function apiOptions(tool: ToolDef, values: OptionValues): OptionValues {
  if (tool.slug === 'image-convert') {
    return { targetFormat: values.targetFormat, quality: Number(values.quality) };
  }
  return values;
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
      />
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function PasswordField({
  label,
  hint,
  value,
  onChange,
  disabled,
  autoComplete,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="password"
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
      />
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export default function ToolOptions({ tool, values, onChange, disabled }: ToolOptionsProps) {
  const set = (patch: OptionValues) => onChange({ ...values, ...patch });

  switch (tool.slug) {
    case 'split-pdf':
      return (
        <TextField
          label="Pages to split out"
          hint="Leave empty to split into one file per page. Otherwise use ranges, e.g. 1-3,7,10-12."
          placeholder="1-3,7,10-12"
          value={String(values.pages ?? '')}
          onChange={(pages) => set({ pages })}
          disabled={disabled}
        />
      );

    case 'extract-pages':
      return (
        <TextField
          label="Pages to keep"
          hint="They appear in the new PDF in the order you list them."
          placeholder="2,5,9-12"
          value={String(values.pages ?? '')}
          onChange={(pages) => set({ pages })}
          disabled={disabled}
        />
      );

    case 'remove-pages':
      return (
        <TextField
          label="Pages to delete"
          hint="Everything else is kept in its original order."
          placeholder="1,4,8-10"
          value={String(values.pages ?? '')}
          onChange={(pages) => set({ pages })}
          disabled={disabled}
        />
      );

    case 'organize-pdf':
      return (
        <TextField
          label="New page order"
          hint="List every page you want to keep, in order. A page you leave out is removed; a page listed twice appears twice."
          placeholder="3,1,2,4"
          value={String(values.order ?? '')}
          onChange={(order) => set({ order })}
          disabled={disabled}
        />
      );

    case 'rotate-pdf':
      return (
        <div className="space-y-4">
          <FormatPicker
            label="Rotate by"
            value={String(values.angle ?? 90)}
            onChange={(angle) => set({ angle: Number(angle) })}
            disabled={disabled}
            options={[
              { value: '90', label: '90°', hint: 'clockwise' },
              { value: '180', label: '180°', hint: 'upside down' },
              { value: '270', label: '270°', hint: 'anti-clockwise' },
            ]}
          />
          <TextField
            label="Pages to rotate"
            hint="Leave empty to rotate every page."
            placeholder="2,5-8"
            value={String(values.pages ?? '')}
            onChange={(pages) => set({ pages })}
            disabled={disabled}
          />
        </div>
      );

    case 'jpg-to-pdf':
      return (
        <FormatPicker
          label="Page size"
          value={String(values.pageSize ?? 'a4')}
          onChange={(pageSize) => set({ pageSize })}
          disabled={disabled}
          options={[
            { value: 'a4', label: 'A4', hint: 'with margins' },
            { value: 'letter', label: 'US Letter', hint: 'with margins' },
            { value: 'fit', label: 'Fit image', hint: 'no margins' },
          ]}
        />
      );

    case 'pdf-to-jpg':
      return (
        <div className="space-y-4">
          <FormatPicker
            label="Image format"
            value={String(values.format ?? 'jpg')}
            onChange={(format) => set({ format })}
            disabled={disabled}
            options={[
              { value: 'jpg', label: 'JPG', hint: 'smaller' },
              { value: 'png', label: 'PNG', hint: 'lossless' },
            ]}
          />
          <FormatPicker
            label="Resolution"
            value={String(values.dpi ?? 150)}
            onChange={(dpi) => set({ dpi: Number(dpi) })}
            disabled={disabled}
            options={[
              { value: '72', label: '72 DPI', hint: 'preview' },
              { value: '150', label: '150 DPI', hint: 'screen' },
              { value: '300', label: '300 DPI', hint: 'print' },
            ]}
          />
        </div>
      );

    case 'image-convert':
      return (
        <div className="space-y-4">
          <FormatPicker
            label="Convert to"
            value={String(values.targetFormat ?? 'jpg')}
            onChange={(targetFormat) => set({ targetFormat })}
            disabled={disabled}
            options={[
              { value: 'jpg', label: 'JPG' },
              { value: 'png', label: 'PNG', hint: 'lossless' },
              { value: 'webp', label: 'WebP', hint: 'smallest' },
            ]}
          />
          {values.targetFormat !== 'png' && (
            <label className="block">
              <span className="mb-2 flex items-center justify-between text-sm font-medium text-gray-700">
                Quality <span className="text-gray-500">{String(values.quality ?? 85)}</span>
              </span>
              <input
                type="range"
                min={1}
                max={100}
                disabled={disabled}
                value={Number(values.quality ?? 85)}
                onChange={(event) => set({ quality: Number(event.target.value) })}
                className="w-full accent-blue-800"
              />
            </label>
          )}
        </div>
      );

    case 'compress-pdf':
      return (
        <FormatPicker
          label="Compression level"
          value={String(values.level ?? 'ebook')}
          onChange={(level) => set({ level })}
          disabled={disabled}
          options={[
            { value: 'screen', label: 'Strong', hint: 'email' },
            { value: 'ebook', label: 'Balanced', hint: 'general use' },
            { value: 'printer', label: 'Light', hint: 'still prints well' },
          ]}
        />
      );

    case 'protect-pdf':
      return (
        <PasswordField
          label="Password to set"
          hint="AES-256. We never log or store it — and a PDF whose password is lost cannot be recovered, by us or anyone else."
          value={String(values.password ?? '')}
          onChange={(password) => set({ password })}
          disabled={disabled}
          autoComplete="new-password"
        />
      );

    case 'unlock-pdf':
      return (
        <PasswordField
          label="Password for this PDF"
          hint="We decrypt only with the correct password. FileForge does not guess or crack PDF passwords."
          value={String(values.password ?? '')}
          onChange={(password) => set({ password })}
          disabled={disabled}
          autoComplete="off"
        />
      );

    case 'bank-statement-to-excel':
    case 'bank-statement-to-tally':
      return (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Bank</span>
          <select
            value={String(values.bank ?? 'auto')}
            disabled={disabled}
            onChange={(event) => set({ bank: event.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
          >
            <option value="auto">Detect automatically</option>
            <option value="hdfc">HDFC Bank</option>
            <option value="icici">ICICI Bank</option>
            <option value="sbi">State Bank of India</option>
            <option value="kotak">Kotak Mahindra Bank</option>
            <option value="generic">Other bank (generic reader)</option>
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            Detection is usually right. Choose your bank explicitly if the result looks wrong.
          </span>
        </label>
      );

    default:
      return null;
  }
}
