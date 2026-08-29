import { useEffect, useRef, useState, MouseEvent } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

interface ClickToCallButtonProps {
  leadId: string;
  phoneNumber?: string;
  disabled?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  onSettled?: () => void;
}

let telephonyEnabledCache: Promise<boolean> | null = null;

function loadTelephonyEnabled(api: { get: (url: string) => Promise<{ data: { telephony_enabled?: boolean } }> }): Promise<boolean> {
  if (!telephonyEnabledCache) {
    telephonyEnabledCache = api
      .get('/admin/features')
      .then((res) => !!res.data?.telephony_enabled)
      .catch(() => false);
  }
  return telephonyEnabledCache;
}

export function ClickToCallButton({
  leadId,
  phoneNumber,
  disabled,
  size = 'sm',
  className,
  onSettled,
}: ClickToCallButtonProps) {
  const { api, user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [calling, setCalling] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Call');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadTelephonyEnabled(api).then(setEnabled);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setCalling(false);
    setStatusLabel('Call');
  };

  const pollCall = async (tataCallId: string) => {
    try {
      const response = await api.get(`/calls/lead/${leadId}`);
      const calls = Array.isArray(response.data) ? response.data : [];
      const match = calls.find((c: { tata_call_id?: string }) => c.tata_call_id === tataCallId);
      if (!match) return;

      if (match.ended_at || match.recording_url || match.outcome) {
        stopPolling();
        onSettled?.();
        if (match.recording_url) {
          toast.success('Call completed — recording is on the lead timeline');
        } else {
          toast.success('Call completed');
        }
        return;
      }
      if (match.answered_at) {
        setStatusLabel('Live');
      } else {
        setStatusLabel('Ringing');
      }
    } catch {
      // keep polling
    }
  };

  const handleCall = async (e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!phoneNumber) {
      toast.error('No phone number available');
      return;
    }
    if (!user?.tata_extension) {
      toast.error('Agent extension not configured. Ask an admin to set your Tata extension.');
      return;
    }

    setCalling(true);
    setStatusLabel('Calling...');
    try {
      const response = await api.post('/tata/click-to-call', { lead_id: leadId });
      const tataCallId = response.data?.call_id;
      toast.success('Call initiated. Your phone will ring shortly.');
      if (!tataCallId) {
        stopPolling();
        return;
      }
      setStatusLabel('Ringing');
      const started = Date.now();
      pollRef.current = setInterval(() => {
        if (Date.now() - started > 90_000) {
          stopPolling();
          onSettled?.();
          return;
        }
        pollCall(tataCallId);
      }, 2500);
      pollCall(tataCallId);
    } catch (error: any) {
      stopPolling();
      toast.error(error.response?.data?.detail || 'Failed to initiate call');
    }
  };

  if (!enabled) return null;

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleCall}
      disabled={disabled || calling || !phoneNumber}
      className={className || 'gap-2'}
      data-testid="click-to-call-btn"
    >
      {calling ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Phone className="w-4 h-4" />
      )}
      {statusLabel}
    </Button>
  );
}
