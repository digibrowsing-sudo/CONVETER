interface FormatPickerProps {
  label: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function FormatPicker({ label, options, value, onChange, disabled }: FormatPickerProps) {
  return (
    <fieldset className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <legend className="mb-2 text-sm font-medium text-gray-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors
              ${
                value === opt.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary'
              }`}
          >
            {opt.label}
            {opt.hint && (
              <span className={`block text-xs font-normal ${value === opt.value ? 'text-blue-100' : 'text-gray-400'}`}>
                {opt.hint}
              </span>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
