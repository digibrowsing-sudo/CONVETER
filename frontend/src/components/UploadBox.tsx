import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '../lib/api';

interface UploadBoxProps {
  accept: string;
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function UploadBox({ accept, multiple, files, onFiles, disabled }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const acceptedExts = accept.split(',').map((e) => e.trim().toLowerCase());
  const matchesAccept = (file: File) =>
    acceptedExts.some((ext) => file.name.toLowerCase().endsWith(ext));

  function addFiles(incoming: FileList | null) {
    if (!incoming || disabled) return;
    const picked = Array.from(incoming).filter(matchesAccept);
    onFiles(multiple ? [...files, ...picked] : picked.slice(0, 1));
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function removeFile(index: number) {
    onFiles(files.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer select-none
          ${dragOver ? 'border-primary bg-blue-50' : 'border-gray-300 bg-white hover:border-primary-light'}
          ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
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
        <p className="text-sm text-gray-500">Accepted: {accept.split(',').join(', ')}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 text-sm"
            >
              <span className="truncate font-medium text-gray-800">{file.name}</span>
              <span className="ml-3 flex shrink-0 items-center gap-3 text-gray-500">
                {formatBytes(file.size)}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${file.name}`}
                    className="text-gray-400 hover:text-red-500"
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
