const STATUS_LABELS = {
  idle: 'Ready',
  uploading: 'Uploading image...',
  queued: 'Queued — waiting to start...',
  running: 'Generating 3D model...',
  success: 'Complete!',
  failed: 'Generation failed',
};

export default function ProgressBar({ status, progress, error }) {
  if (status === 'idle') return null;

  const isActive = ['uploading', 'queued', 'running'].includes(status);
  const barColor = status === 'success'
    ? 'bg-green-500'
    : status === 'failed'
      ? 'bg-red-500'
      : 'bg-indigo-500';

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className={status === 'failed' ? 'text-red-400' : 'text-gray-300'}>
          {STATUS_LABELS[status] || status}
        </span>
        <span className="text-gray-400">{Math.round(progress)}%</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor} ${
            isActive ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.max(progress, isActive ? 5 : 0)}%` }}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
