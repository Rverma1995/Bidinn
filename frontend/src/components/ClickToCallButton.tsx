import { useEffect, useRef, useState, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import type { CallLog } from '../types';
import type { PostCallLeadSummary } from './PostCallWrapUpDialog';

interface ClickToCallButtonProps {
  leadId: string;
  phoneNumber?: string;
  lead?: PostCallLeadSummary;
  disabled?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  iconOnly?: boolean;
  onSettled?: () => void;
  onInitiated?: () => void;
  onWrapUpRequired?: (payload: { call: CallLog; lead: PostCallLeadSummary }) => void;
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

function buildLeadSummary(
  leadId: string,
  phoneNumber?: string,
  lead?: PostCallLeadSummary
): PostCallLeadSummary {
  return {
    id: leadId,
    name: lead?.name || 'Lead',
    phone: lead?.phone || phoneNumber || '',
    status: lead?.status || 'new',
  };
}

export function ClickToCallButton({
  leadId,
  phoneNumber,
  lead,
  disabled,
  size = 'sm',
  className,
  iconOnly = false,
  onSettled,
  onInitiated,
  onWrapUpRequired,
}: ClickToCallButtonProps) {
  const { api, user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [calling, setCalling] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Call');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrapUpTriggeredRef = useRef(false);

  useEffect(() => {
    loadTelephonyEnabled(api).then(setEnabled);
  }, [api]);

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

  const handleTerminalCall = (match: CallLog) => {
    stopPolling();
    const needsWrapUp = !!match.answered_at && !!match.ended_at && !match.wrap_up_completed;

    if (needsWrapUp && !wrapUpTriggeredRef.current) {
      wrapUpTriggeredRef.current = true;
      onWrapUpRequired?.({
        call: match,
        lead: buildLeadSummary(leadId, phoneNumber, lead),
      });
      return;
    }

    onSettled?.();
    if (match.recording_url) {
      toast.success('Call completed — recording is on the lead timeline');
    } else if (match.answered_at) {
      toast.success('Call completed');
    } else {
      toast.message('Call ended — customer did not answer');
    }
  };

  const pollCall = async (tataCallId: string) => {
    try {
      const syncResponse = await api.post(`/tata/sync-call/${tataCallId}`);
      const match = (syncResponse.data || null) as CallLog | null;
      if (!match || match.tata_call_id !== tataCallId) return;

      if (match.ended_at) {
        handleTerminalCall(match);
        return;
      }

      if (match.answered_at || match.live_state === 'live') {
        setStatusLabel('Live');
      } else if (match.live_state === 'calling_customer') {
        setStatusLabel('Calling customer...');
      } else {
        setStatusLabel('Ringing your phone...');
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
    let extension = user?.tata_extension;
    if (!extension) {
      try {
        const freshUser = await refreshUser();
        extension = freshUser?.tata_extension;
      } catch {
        // fall through to error below
      }
    }
    if (!extension) {
      toast.error('Set your Tata extension in Settings before calling.', {
        action: {
          label: 'Open Settings',
          onClick: () => navigate('/settings'),
        },
      });
      return;
    }

    wrapUpTriggeredRef.current = false;
    setCalling(true);
    setStatusLabel('Calling...');
    try {
      const response = await api.post('/tata/click-to-call', { lead_id: leadId });
      const tataCallId = response.data?.call_id;
      toast.success('Call initiated. Your phone will ring shortly.');
      onInitiated?.();
      if (!tataCallId) {
        stopPolling();
        return;
      }
      setStatusLabel('Ringing your phone...');
      const started = Date.now();
      pollRef.current = setInterval(() => {
        if (Date.now() - started > 120_000) {
          stopPolling();
          toast.message('No call status received. Check that your Tata extension matches Smartflo and webhooks are configured.');
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

  const buttonSize = iconOnly ? 'icon' : size;

  return (
    <Button
      variant="outline"
      size={buttonSize}
      onClick={handleCall}
      disabled={disabled || calling || !phoneNumber}
      className={className || (iconOnly ? '' : 'gap-2')}
      title={iconOnly ? (calling ? statusLabel : `Call ${phoneNumber}`) : undefined}
      data-testid="click-to-call-btn"
    >
      {calling ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Phone className="w-4 h-4" />
      )}
      {!iconOnly && statusLabel}
    </Button>
  );
}
