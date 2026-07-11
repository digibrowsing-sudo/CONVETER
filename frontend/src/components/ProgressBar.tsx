interface ProgressBarProps {
  progress: number; // 0–100
  statusText: string;
}

export default function ProgressBar({ progress, statusText }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div aria-live="polite">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{statusText}</span>
        <span className="text-gray-500">{clamped}%</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
