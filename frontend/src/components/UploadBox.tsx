import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '../lib/api';

interface UploadBoxProps {
  accept: string;
  maxFiles: number;
  maxBytes: number;
  files: File[];
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Merge and JPG-to-PDF care about order; single-file tools do not. */
  orderable?: boolean;
}

export default function UploadBox({
  accept,
  maxFiles,
  maxBytes,
  files,
  onFiles,
  disabled,
  orderable,
}: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const multiple = maxFiles > 1;
  const acceptedExts = accept.split(',').map((ext) => ext.trim().toLowerCase());

  function addFiles(incoming: FileList | null) {
    if (!incoming || disabled) return;
    setNotice(null);

    const picked = Array.from(incoming);
    const wrongType = picked.filter(
      (file) => !acceptedExts.some((ext) => file.name.toLowerCase().endsWith(ext)),
    );
    const oversized = picked.filter((file) => file.size > maxBytes);
    const usable = picked.filter((file) => !wrongType.includes(file) && !oversized.includes(file));

    // Rejecting here, before any upload starts, is the difference between an
    // instant explanation and a 30-second wait ending in a 413.
    if (oversized.length > 0) {
      setNotice(
        `${oversized.length === 1 ? 'That file is' : 'Some files are'} larger than the ` +
          `${Math.floor(maxBytes / (1024 * 1024))} MB limit for this tool.`,
      );
    } else if (wrongType.length > 0) {
      setNotice(`This tool accepts ${acceptedExts.join(', ')} files.`);
    }

    const next = multiple ? [...files, ...usable].slice(0, maxFiles) : usable.slice(0, 1);
    if (multiple && files.length + usable.length > maxFiles) {
      setNotice(`You can add up to ${maxFiles} files here.`);
    }
    onFiles(next);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    onFiles(next);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose files"
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors
          ${dragOver ? 'border-primary bg-blue-50' : 'border-gray-300 bg-white hover:border-primary-light'}
          ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        <svg
          className="h-10 w-10 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="font-medium text-gray-800">
          {multiple ? 'Drop files here or click to browse' : 'Drop a file here or click to browse'}
        </p>
        <p className="text-sm text-gray-500">
          {acceptedExts.join(', ')} · up to {Math.floor(maxBytes / (1024 * 1024))} MB
          {multiple ? ` · up to ${maxFiles} files` : ''}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {notice && (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {notice}
        </p>
      )}

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                {orderable && files.length > 1 && (
                  <span className="shrink-0 text-xs font-semibold text-gray-400">{index + 1}.</span>
                )}
                <span className="truncate font-medium text-gray-800">{file.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-gray-500">
                <span>{formatBytes(file.size)}</span>
                {orderable && files.length > 1 && !disabled && (
                  <>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${file.name} earlier`}
                      className="rounded px-1 text-gray-400 hover:text-primary disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === files.length - 1}
                      aria-label={`Move ${file.name} later`}
                      className="rounded px-1 text-gray-400 hover:text-primary disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onFiles(files.filter((_, i) => i !== index))}
                    aria-label={`Remove ${file.name}`}
                    className="rounded px-1 text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
