import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/utils';

interface CallRecordingPlayerProps {
  url: string;
  durationSeconds?: number | null;
  durationMinutes?: number | null;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CallRecordingPlayer({ url, durationSeconds, durationMinutes }: CallRecordingPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(durationSeconds ?? null);

  useEffect(() => {
    if (durationSeconds != null && durationSeconds > 0) {
      setTotalSeconds(durationSeconds);
    }
  }, [durationSeconds]);

  const totalLabel =
    totalSeconds != null
      ? formatAudioTime(totalSeconds)
      : durationMinutes
        ? formatDuration(durationMinutes)
        : null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Recording</span>
        {totalLabel && (
          <span className="tabular-nums">
            {formatAudioTime(currentTime)} / {totalLabel}
          </span>
        )}
      </div>
      <audio
        className="w-full max-w-md"
        controls
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const duration = e.currentTarget.duration;
          if (Number.isFinite(duration)) setTotalSeconds(duration);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      >
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}
