import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Avatar, AvatarFallback } from './ui/avatar';
import { toast } from 'sonner';
import {
  CALL_OUTCOMES,
  CLOSED_REASONS,
  LEAD_STATUSES,
  STATUSES_REQUIRING_REASON,
  cn,
  generateInitials,
  getStatusLabel,
  isTransitionAllowed,
} from '../lib/utils';
import type { CallLog } from '../types';
import {
  Loader2,
  Phone,
  ThumbsUp,
  ThumbsDown,
  CalendarClock,
  Trophy,
  XCircle,
} from 'lucide-react';

export interface PostCallLeadSummary {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface PostCallWrapUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: CallLog | null;
  lead: PostCallLeadSummary | null;
  onSuccess?: () => void;
  /** Keep dialog open until wrap-up is saved (no escape/outside click). */
  preventClose?: boolean;
}

export function PostCallWrapUpDialog({
  open,
  onOpenChange,
  call,
  lead,
  onSuccess,
  preventClose = true,
}: PostCallWrapUpDialogProps) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('connected');
  const [leadStatus, setLeadStatus] = useState('');
  const [duration, setDuration] = useState(0);
  const [nextFollowup, setNextFollowup] = useState('');
  const [closedReason, setClosedReason] = useState('');
  const [closedReasonNotes, setClosedReasonNotes] = useState('');
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('');

  useEffect(() => {
    if (!open || !call || !lead) return;
    setNotes('');
    setOutcome('connected');
    setLeadStatus(lead.status);
    setDuration(call.duration_minutes || 0);
    setNextFollowup('');
    setClosedReason('');
    setClosedReasonNotes('');
    setPendingStatus('');
    setShowReasonDialog(false);
  }, [open, call?.id, lead?.id]);

  useEffect(() => {
    if (!open || !call) return;
    if (call.duration_minutes != null && call.duration_minutes > 0) {
      setDuration(call.duration_minutes);
    }
  }, [open, call?.duration_minutes, call?.ended_at, call?.recording_url]);

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && preventClose) return;
    onOpenChange(next);
  };

  const isLive = !!call?.answered_at && !call?.ended_at;

  const submitWrapUp = async (statusOverride?: string, reason?: string, reasonNotes?: string) => {
    if (!call || !lead) return;
    if (!notes.trim()) {
      toast.error('Please add call notes before saving');
      return;
    }

    const statusToApply = statusOverride || (leadStatus !== lead.status ? leadStatus : undefined);
    if (statusToApply && statusToApply !== lead.status) {
      const transition = isTransitionAllowed(lead.status, statusToApply);
      if (!transition.allowed) {
        toast.error(transition.message);
        return;
      }
      if (STATUSES_REQUIRING_REASON.includes(statusToApply) && !reason) {
        setPendingStatus(statusToApply);
        setShowReasonDialog(true);
        return;
      }
    }

    setLoading(true);
    try {
      await api.patch(`/calls/${call.id}/wrap-up`, {
        notes: notes.trim(),
        outcome,
        duration_minutes: duration,
        next_followup: nextFollowup || null,
        lead_status: statusToApply,
        closed_reason: reason,
        closed_reason_notes: reasonNotes,
      });
      toast.success('Call logged successfully');
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to save call notes';
      if (error.response?.data?.rule === 'closed_reason_required') {
        setPendingStatus(statusToApply || leadStatus);
        setShowReasonDialog(true);
      } else {
        toast.error(detail);
      }
    } finally {
      setLoading(false);
    }
  };

  const quickAction = (status: string) => {
    setLeadStatus(status);
    submitWrapUp(status);
  };

  if (!lead || !call) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={cn('sm:max-w-[620px]', preventClose && '[&>button.absolute]:hidden')}
          data-testid="post-call-wrap-up-dialog"
          onInteractOutside={(e) => preventClose && e.preventDefault()}
          onEscapeKeyDown={(e) => preventClose && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-emerald-100 text-emerald-700">
                  {generateInitials(lead.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <span className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  {isLive ? 'Call connected — add notes' : 'Call ended — wrap up'}
                </span>
                <p className="text-sm font-normal text-muted-foreground">{lead.name} · {lead.phone}</p>
              </div>
            </DialogTitle>
            <DialogDescription>
              {isLive
                ? 'You are on a live call. Add notes and update the lead stage — save when you hang up.'
                : 'The call has ended. Outcome is set to Connected by default — add notes and update the lead stage if needed.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wrap-up-notes">Call notes *</Label>
              <Textarea
                id="wrap-up-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="What was discussed on the call?"
                data-testid="wrap-up-notes"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Call outcome</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALL_OUTCOMES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lead stage</Label>
                <Select value={leadStatus} onValueChange={setLeadStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Next follow-up</Label>
                <Input
                  type="datetime-local"
                  value={nextFollowup}
                  onChange={(e) => setNextFollowup(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Quick stage updates:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => quickAction('interested')} disabled={loading}>
                  <ThumbsUp className="w-4 h-4 mr-1 text-emerald-600" />
                  Interested
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => quickAction('not_interested')} disabled={loading}>
                  <ThumbsDown className="w-4 h-4 mr-1" />
                  Not interested
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => quickAction('followup')} disabled={loading}>
                  <CalendarClock className="w-4 h-4 mr-1 text-amber-600" />
                  Follow-up
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => quickAction('won')} disabled={loading}>
                  <Trophy className="w-4 h-4 mr-1 text-green-600" />
                  Won
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => quickAction('lost')} disabled={loading}>
                  <XCircle className="w-4 h-4 mr-1 text-red-600" />
                  Lost
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setLeadStatus(lead.status)} disabled={loading}>
                  Keep {getStatusLabel(lead.status)}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            {!preventClose && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
            )}
            <Button type="button" onClick={() => submitWrapUp()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save call notes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reason required</DialogTitle>
            <DialogDescription>
              Please select a reason for moving to {getStatusLabel(pendingStatus || leadStatus)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={closedReason} onValueChange={setClosedReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {CLOSED_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional notes</Label>
              <Textarea
                value={closedReasonNotes}
                onChange={(e) => setClosedReasonNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => submitWrapUp(pendingStatus || leadStatus, closedReason, closedReasonNotes)}
              disabled={loading || !closedReason}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
