import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';

interface CallRecordingPlayerProps {
  callId: string;
  url?: string | null;
  durationSeconds?: number | null;
  durationMinutes?: number | null;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CallRecordingPlayer({
  callId,
  durationSeconds,
  durationMinutes,
}: CallRecordingPlayerProps) {
  const { api } = useAuth();
  const [started, setStarted] = useState(false);
  const [loadId, setLoadId] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(durationSeconds ?? null);

  useEffect(() => {
    if (durationSeconds != null && durationSeconds > 0) {
      setTotalSeconds(durationSeconds);
    }
  }, [durationSeconds]);

  useEffect(() => {
    if (!started) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setError(null);
    setSrc(null);
    setCurrentTime(0);

    (async () => {
      try {
        const response = await api.get(`/tata/recording/${callId}`, { responseType: 'blob' });
        if (cancelled) return;
        const blob = new Blob([response.data], { type: 'audio/mpeg' });
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setError('Recording could not be loaded');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, callId, started, loadId]);

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
            {src ? `${formatAudioTime(currentTime)} / ${totalLabel}` : totalLabel}
          </span>
        )}
      </div>
      {error ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-destructive">{error}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setStarted(true);
              setLoadId((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : !started ? (
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setStarted(true)}>
          Play recording
        </Button>
      ) : src ? (
        <audio
          className="w-full max-w-md"
          controls
          autoPlay
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const duration = e.currentTarget.duration;
            if (Number.isFinite(duration) && duration > 0) setTotalSeconds(duration);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onError={() => setError('Recording could not be played')}
        >
          Your browser does not support audio playback.
        </audio>
      ) : (
        <p className="text-xs text-muted-foreground">Loading recording…</p>
      )}
    </div>
  );
}
