import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ClickToCallButton } from '../components/ClickToCallButton';
import { toast } from 'sonner';
import {
  getStatusLabel,
  formatRelativeTime,
  formatCurrency,
  getCountdownTime,
  generateInitials,
  ACTIVE_PIPELINE_STATUSES,
  CALL_OUTCOMES,
  CLOSED_REASONS,
  STATUSES_REQUIRING_REASON,
  STATUSES_REQUIRING_ASSIGNMENT,
  isTransitionAllowed,
  isLeadStalled,
  cn,
} from '../lib/utils';
import {
  Loader2,
  User,
  ThumbsUp,
  ThumbsDown,
  CalendarClock,
  Trophy,
  XCircle,
  PhoneCall,
  PhoneMissed,
  CheckCircle2,
  Search,
  ArrowRight,
  Clock,
} from 'lucide-react';

const UNCONTACTED_DEADLINE_MS = 60 * 60 * 1000;

function formatOverdueDuration(sinceMs: number) {
  const diffMs = Math.max(0, Date.now() - sinceMs);
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d overdue`;
  }
  if (hours > 0) return `${hours}h ${mins}m overdue`;
  return `${mins}:${secs.toString().padStart(2, '0')} overdue`;
}

// Quick Action Panel for updating lead after call
function QuickActionPanel({ lead, open, onClose, onSuccess, api }) {
  const [loading, setLoading] = useState(false);
  const [callOutcome, setCallOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [newStatus, setNewStatus] = useState(lead?.status || '');
  const [duration, setDuration] = useState(5);
  const [closedReasonDialogOpen, setClosedReasonDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ outcome: string; status: string } | null>(null);
  const [closedReason, setClosedReason] = useState('');
  const [closedReasonNotes, setClosedReasonNotes] = useState('');

  useEffect(() => {
    if (lead) {
      setNewStatus(lead.status);
      setCallOutcome('');
      setNotes('');
      setNextFollowup('');
      setDuration(5);
      setClosedReason('');
      setClosedReasonNotes('');
    }
  }, [lead]);

  const buildStatusChangeNotes = (outcome: string, status: string, userNotes?: string) => {
    const trimmed = userNotes?.trim();
    if (trimmed) return trimmed;
    const outcomeLabel =
      CALL_OUTCOMES.find((o) => o.value === outcome)?.label || outcome.replace(/_/g, ' ');
    return `Quick action: ${outcomeLabel} → ${getStatusLabel(status)}`;
  };

  const handleQuickAction = async (outcome: string, status: string, reason?: string, reasonNotes?: string) => {
    // Check transition rules
    if (status !== lead.status) {
      const transitionCheck = isTransitionAllowed(lead.status, status);
      if (!transitionCheck.allowed) {
        toast.error(transitionCheck.message);
        return;
      }

      // Check assignment requirement
      if (STATUSES_REQUIRING_ASSIGNMENT.includes(status) && !lead.assigned_to) {
        toast.error(`Lead must be assigned before moving to ${getStatusLabel(status)} status`);
        return;
      }

      // Check if reason is required
      if (STATUSES_REQUIRING_REASON.includes(status) && !reason) {
        setPendingAction({ outcome, status });
        setClosedReasonDialogOpen(true);
        return;
      }
    }

    setLoading(true);
    try {
      // Log the call
      await api.post('/calls', {
        lead_id: lead.id,
        outcome: outcome,
        duration_minutes: duration,
        notes: notes || `Quick action: ${outcome}`,
        next_followup: nextFollowup || null,
      });

      // Update lead status if changed (backend requires notes on any stage change)
      if (status !== lead.status) {
        const updateData: any = {
          status,
          notes: buildStatusChangeNotes(outcome, status, notes || reasonNotes),
        };
        if (reason) {
          updateData.closed_reason = reason;
          updateData.closed_reason_notes = reasonNotes;
        }
        await api.put(`/leads/${lead.id}`, updateData);
      }

      toast.success('Lead updated successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail || 'Failed to update lead';
      const rule = error.response?.data?.rule;
      
      if (rule === 'closed_reason_required') {
        setPendingAction({ outcome, status });
        setClosedReasonDialogOpen(true);
      } else if (rule === 'notes_required_for_stage_change') {
        toast.error('Please add notes before changing the lead status');
      } else {
        toast.error(errorDetail);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClosedReasonSubmit = async () => {
    if (!closedReason) {
      toast.error('Please select a reason');
      return;
    }
    if (pendingAction) {
      await handleQuickAction(pendingAction.outcome, pendingAction.status, closedReason, closedReasonNotes);
      setClosedReasonDialogOpen(false);
      setPendingAction(null);
      setClosedReason('');
      setClosedReasonNotes('');
    }
  };

  const handleDetailedSubmit = async () => {
    if (!callOutcome) {
      toast.error('Please select a call outcome');
      return;
    }
    await handleQuickAction(callOutcome, newStatus);
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]" data-testid="quick-action-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {generateInitials(lead.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span>{lead.name}</span>
              <p className="text-sm font-normal text-muted-foreground">{lead.phone}</p>
            </div>
          </DialogTitle>
          <DialogDescription>
            Update call outcome and lead status after your conversation
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="quick" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quick">Quick Actions</TabsTrigger>
            <TabsTrigger value="detailed">Detailed Log</TabsTrigger>
          </TabsList>

          {/* Quick Actions Tab */}
          <TabsContent value="quick" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Select the outcome of your call:</p>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Connected - Interested */}
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-emerald-50 hover:border-emerald-500 dark:hover:bg-emerald-900/20"
                onClick={() => handleQuickAction('connected', 'interested')}
                disabled={loading}
              >
                <ThumbsUp className="w-6 h-6 text-emerald-600" />
                <span className="font-medium">Interested</span>
                <span className="text-xs text-muted-foreground">Customer showed interest</span>
              </Button>

              {/* Connected - Not Interested */}
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-slate-100 hover:border-slate-500 dark:hover:bg-slate-800"
                onClick={() => handleQuickAction('connected', 'not_interested')}
                disabled={loading}
              >
                <ThumbsDown className="w-6 h-6 text-slate-600" />
                <span className="font-medium">Not Interested</span>
                <span className="text-xs text-muted-foreground">Customer declined</span>
              </Button>

              {/* Need Follow-up */}
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-amber-50 hover:border-amber-500 dark:hover:bg-amber-900/20"
                onClick={() => handleQuickAction('callback_requested', 'followup')}
                disabled={loading}
              >
                <CalendarClock className="w-6 h-6 text-amber-600" />
                <span className="font-medium">Schedule Follow-up</span>
                <span className="text-xs text-muted-foreground">Call back later</span>
              </Button>

              {/* No Answer */}
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-orange-50 hover:border-orange-500 dark:hover:bg-orange-900/20"
                onClick={() => handleQuickAction('no_answer', 'not_answered')}
                disabled={loading}
              >
                <PhoneMissed className="w-6 h-6 text-orange-600" />
                <span className="font-medium">No Answer</span>
                <span className="text-xs text-muted-foreground">Couldn't reach</span>
              </Button>

              {/* Won */}
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-green-50 hover:border-green-500 dark:hover:bg-green-900/20"
                onClick={() => handleQuickAction('connected', 'won')}
                disabled={loading}
              >
                <Trophy className="w-6 h-6 text-green-600" />
                <span className="font-medium">Won / Converted</span>
                <span className="text-xs text-muted-foreground">Deal closed!</span>
              </Button>

              {/* Lost */}
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-red-50 hover:border-red-500 dark:hover:bg-red-900/20"
                onClick={() => handleQuickAction('connected', 'lost')}
                disabled={loading}
              >
                <XCircle className="w-6 h-6 text-red-600" />
                <span className="font-medium">Lost</span>
                <span className="text-xs text-muted-foreground">Deal lost</span>
              </Button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </TabsContent>

          {/* Detailed Log Tab */}
          <TabsContent value="detailed" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Call Outcome *</Label>
                <Select value={callOutcome} onValueChange={setCallOutcome}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    {CALL_OUTCOMES.map((outcome) => (
                      <SelectItem key={outcome.value} value={outcome.value}>
                        {outcome.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="not_answered">Not Answered</SelectItem>
                    <SelectItem value="interested">Interested</SelectItem>
                    <SelectItem value="not_interested">Not Interested</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Next Follow-up</Label>
                <Input
                  type="datetime-local"
                  value={nextFollowup}
                  onChange={(e) => setNextFollowup(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Call summary, next steps, etc..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleDetailedSubmit} disabled={loading || !callOutcome}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save & Update
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Closed Reason Sub-Dialog */}
      <Dialog open={closedReasonDialogOpen} onOpenChange={setClosedReasonDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="quick-action-closed-reason-dialog">
          <DialogHeader>
            <DialogTitle>Reason Required</DialogTitle>
            <DialogDescription>
              Please provide a reason for marking this lead as {pendingAction?.status === 'lost' ? 'Lost' : 'Not Interested'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={closedReason} onValueChange={setClosedReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
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
              <Label>Additional Notes (Optional)</Label>
              <Textarea
                value={closedReasonNotes}
                onChange={(e) => setClosedReasonNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setClosedReasonDialogOpen(false);
                setPendingAction(null);
                setClosedReason('');
                setClosedReasonNotes('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleClosedReasonSubmit} disabled={loading || !closedReason}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// Lead card — readable two-block layout; no overlapping text
function LeadCard({ lead, onCallClick }) {
  const [timerState, setTimerState] = useState(null);
  const showCountdown = lead.status === 'new' && lead.attempt_count === 0;
  const stalled = isLeadStalled(lead);
  const overdueFollowup =
    lead.next_followup &&
    new Date(lead.next_followup) < new Date() &&
    !['won', 'lost'].includes(lead.status);
  const isFollowupOverdue = overdueFollowup && !showCountdown;
  const isUncontactedOverdue = showCountdown && lead.is_overdue;

  useEffect(() => {
    const tick = () => {
      if (showCountdown) {
        const countdown = getCountdownTime(lead.created_at);
        if (!countdown) {
          setTimerState(null);
          return;
        }
        if (countdown.expired) {
          const deadline = new Date(lead.created_at).getTime() + UNCONTACTED_DEADLINE_MS;
          setTimerState({ text: formatOverdueDuration(deadline), variant: 'overdue' });
        } else {
          setTimerState({ text: countdown.text, variant: 'countdown', urgent: countdown.urgent });
        }
        return;
      }
      if (overdueFollowup && lead.next_followup) {
        setTimerState({
          text: formatOverdueDuration(new Date(lead.next_followup).getTime()),
          variant: 'overdue',
          label: 'Follow-up',
        });
        return;
      }
      setTimerState(null);
    };

    tick();
    if (!showCountdown && !overdueFollowup) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lead.created_at, lead.next_followup, showCountdown, overdueFollowup]);

  const assignee = lead.assigned_name ? lead.assigned_name.split(' ')[0] : 'Unassigned';
  const lastTouch = formatRelativeTime(lead.last_activity || lead.created_at);

  return (
    <Link
      to={`/leads/${lead.id}`}
      title={`${lead.name} · ${lead.phone}`}
      className={cn(
        'group block rounded-lg border bg-white dark:bg-slate-900 overflow-hidden',
        'transition-all hover:shadow-md hover:border-primary/40 no-underline text-inherit',
        isUncontactedOverdue || isFollowupOverdue
          ? 'border-red-200 dark:border-red-800 ring-1 ring-red-100 dark:ring-red-900/40'
          : stalled
            ? 'border-amber-200 dark:border-amber-800'
            : 'border-slate-200 dark:border-slate-700'
      )}
    >
      <div className="p-2.5 sm:p-3">
        <div className="flex gap-2.5 sm:gap-3 items-start">
          <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {generateInitials(lead.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-medium leading-snug line-clamp-2 break-words text-foreground">
              {lead.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.phone}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3 shrink-0" />
                {assignee}
              </span>
              <span className="mx-1">·</span>
              <span>{lastTouch}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {timerState && (
              <Badge
                className={cn(
                  'text-[10px] font-normal tabular-nums inline-flex items-center gap-1',
                  timerState.variant === 'overdue'
                    ? 'bg-red-500 text-white'
                    : timerState.urgent
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                )}
              >
                <Clock className="w-3 h-3 shrink-0" />
                {timerState.label ? `${timerState.label} ` : ''}
                {timerState.text}
              </Badge>
            )}
            {stalled && !showCountdown && (
              <Badge variant="outline" className="text-[10px] font-normal text-amber-700 border-amber-300">
                Stalled
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <ClickToCallButton
              leadId={lead.id}
              phoneNumber={lead.phone}
              iconOnly
              className="h-8 w-8 shrink-0"
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-2.5 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onCallClick(lead);
              }}
            >
              <PhoneCall className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Log</span>
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Pipeline Column Component
interface PipelineColumnProps {
  title: string;
  color: string;
  leads: any[];
  count: number;
  onCallClick: (lead: any) => void;
  onDrop: (e: React.DragEvent, newStatus: string) => void;
  status: string;
  page?: number;
  totalPages?: number;
  loading?: boolean;
  onPageChange?: (page: number) => void;
}

const KANBAN_STAGES = ACTIVE_PIPELINE_STATUSES.filter(
  (stage) => stage.value !== 'won' && stage.value !== 'lost'
);

function ClosedDealsSection({ wonLeads, lostLeads, wonCount, lostCount }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0 mt-3">
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
            <Trophy className="w-4 h-4" />
            Won ({wonCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <ScrollArea className="h-[140px] sm:h-[160px]">
            {wonLeads.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">No won deals yet</p>
            ) : (
              <div className="space-y-1.5">
                {wonLeads.slice(0, 10).map((lead) => (
                  <Link
                    to={`/leads/${lead.id}`}
                    key={lead.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-green-50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20 no-underline text-inherit"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{lead.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.source || lead.phone}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900/30">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
            <XCircle className="w-4 h-4" />
            Lost ({lostCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <ScrollArea className="h-[140px] sm:h-[160px]">
            {lostLeads.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">No lost deals</p>
            ) : (
              <div className="space-y-1.5">
                {lostLeads.slice(0, 10).map((lead) => (
                  <Link
                    to={`/leads/${lead.id}`}
                    key={lead.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 no-underline text-inherit"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{lead.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.source || lead.phone}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineColumn({
  title,
  color,
  leads,
  count,
  onCallClick,
  onDrop,
  status,
  page = 1,
  totalPages = 1,
  loading,
  onPageChange,
}: PipelineColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const colorClasses = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    slate: 'bg-slate-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  const columnTint = {
    blue: 'border-t-blue-500 bg-blue-50/30 dark:bg-blue-950/15',
    emerald: 'border-t-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/15',
    slate: 'border-t-slate-400 bg-slate-50/40 dark:bg-slate-800/20',
    amber: 'border-t-amber-500 bg-amber-50/30 dark:bg-amber-950/15',
    orange: 'border-t-orange-500 bg-orange-50/30 dark:bg-orange-950/15',
    green: 'border-t-green-500 bg-green-50/30 dark:bg-green-950/15',
    red: 'border-t-red-500 bg-red-50/30 dark:bg-red-950/15',
  };

  return (
    <div
      className={cn(
        'flex flex-col flex-shrink-0 h-full rounded-xl border-t-[3px] snap-start',
        'w-[calc(100vw-2.5rem)] max-w-[300px] sm:w-[272px] md:w-[300px]',
        isDragOver
          ? 'border-primary border-dashed bg-primary/5'
          : cn(
              columnTint[color] || 'border-t-slate-300 bg-slate-50/30',
              'border border-slate-200/80 dark:border-slate-700/50'
            )
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop(e, status);
      }}
    >
      <div className="px-3 py-2.5 border-b border-slate-200/60 dark:border-slate-700/50 shrink-0 bg-white/50 dark:bg-slate-900/30 rounded-t-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', colorClasses[color])} />
            <h3 className="font-semibold text-sm truncate">{title}</h3>
            <Badge variant="secondary" className="h-5 px-2 text-[11px] rounded-full tabular-nums">
              {count}
            </Badge>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={page <= 1 || loading}
                onClick={() => onPageChange?.(page - 1)}
              >
                ‹
              </Button>
              <span className="text-[10px] text-muted-foreground tabular-nums min-w-[2.5rem] text-center">
                {page}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={page >= totalPages || loading}
                onClick={() => onPageChange?.(page + 1)}
              >
                ›
              </Button>
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 h-0">
        <div className="p-2 space-y-2">
          {leads.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-[11px]">No leads</div>
          ) : (
            leads.map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('leadId', lead.id);
                  e.dataTransfer.setData('fromStatus', lead.status);
                }}
              >
                <LeadCard lead={lead} onCallClick={onCallClick} />
              </div>
            ))
          )}
          {loading && (
            <div className="text-center py-1 text-[10px] text-muted-foreground">Loading…</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Main Pipeline Page
export default function PipelinePage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ won: 0, lost: 0, revenue: 0, active: 0 });

  const [columnsPaging, setColumnsPaging] = useState({});
  const pagingRef = useRef({});
  const leadsRef = useRef([]);

  const updateLeads = useCallback((updater) => {
    setLeads(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      leadsRef.current = next;
      return next;
    });
  }, []);

  const fetchLeadsForStatus = async (status, page = 1) => {
    const paging = pagingRef.current[status] || { page: 1, totalPages: 1, loading: false };
    if (paging.loading) return;

    pagingRef.current = { ...pagingRef.current, [status]: { ...paging, loading: true } };
    setColumnsPaging({ ...pagingRef.current });

    try {
      let url = `/leads?compact=true&limit=50&status=${status}&page=${page}`;
      
      const response = await api.get(url);
      const newLeads = response.data.leads || response.data;
      const paginationData = response.data.pagination;

      updateLeads(prev => {
        const otherLeads = prev.filter(l => l.status !== status);
        return [...otherLeads, ...newLeads];
      });

      pagingRef.current = {
        ...pagingRef.current,
        [status]: { 
          page: paginationData?.page || page, 
          totalPages: paginationData?.totalPages || 1, 
          total: paginationData?.total || 0,
          loading: false 
        }
      };
      setColumnsPaging({ ...pagingRef.current });
    } catch(e) {
      console.error(`Failed to fetch leads for status ${status}`, e);
      pagingRef.current = { ...pagingRef.current, [status]: { ...pagingRef.current[status], loading: false } };
      setColumnsPaging({ ...pagingRef.current });
    }
  };

  const fetchAllLeads = async () => {
    setLoading(true);
    const statuses = [...KANBAN_STAGES.map((s) => s.value), 'won', 'lost'];
    await Promise.all(statuses.map((s) => fetchLeadsForStatus(s)));
    setLoading(false);
  };

  useEffect(() => {
    fetchAllLeads();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      const data = response.data;
      setStats({
        won: data.closed_won || 0,
        lost: data.closed_lost || 0,
        revenue: data.total_revenue || 0,
        active: (data.total_leads || 0) - (data.closed_won || 0) - (data.closed_lost || 0),
      });
    } catch (error) {
      console.error('Failed to fetch stats');
    }
  };

  const handleDrop = async (e, newStatus) => {
    const leadId = e.dataTransfer.getData('leadId');
    const fromStatus = e.dataTransfer.getData('fromStatus');
    
    if (!leadId || fromStatus === newStatus) return;

    // Find the lead being moved
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Check transition rules (Rule 5)
    const transitionCheck = isTransitionAllowed(fromStatus, newStatus);
    if (!transitionCheck.allowed) {
      toast.error(transitionCheck.message);
      return;
    }

    // Check assignment requirement (Rule 1)
    if (STATUSES_REQUIRING_ASSIGNMENT.includes(newStatus) && !lead.assigned_to) {
      toast.error(`Lead must be assigned before moving to ${getStatusLabel(newStatus)} status`);
      return;
    }

    // Check if reason is required (Rule 2) - redirect to lead detail for closed reasons
    if (STATUSES_REQUIRING_REASON.includes(newStatus)) {
      toast.info('Please provide a reason for closing this lead');
      navigate(`/leads/${leadId}`);
      return;
    }

    // Optimistic update
    setLeads(prev => prev.map(l => 
      l.id === leadId ? { ...l, status: newStatus } : l
    ));

    try {
      await api.put(`/leads/${leadId}`, { status: newStatus, notes: lead.notes || 'Moved via pipeline' });
      toast.success(`Lead moved to ${getStatusLabel(newStatus)}`);
    } catch (error: any) {
      setLeads(prev => prev.map(l => 
        l.id === leadId ? { ...l, status: fromStatus } : l
      ));
      const errorDetail = error.response?.data?.detail || 'Failed to update lead';
      toast.error(errorDetail);
    }
  };

  const handleCallClick = (lead) => {
    setSelectedLead(lead);
    setQuickActionOpen(true);
  };

  const handleQuickActionSuccess = () => {
    fetchAllLeads();
    fetchStats();
  };

  const getLeadsByStatus = (status) => {
    return leads.filter(l => {
      const matchesStatus = l.status === status;
      const matchesSearch = !searchQuery || 
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.phone.includes(searchQuery);
      return matchesStatus && matchesSearch;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-8rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const wonLeads = getLeadsByStatus('won');
  const lostLeads = getLeadsByStatus('lost');

  return (
    <div
      className="flex flex-col -m-4 md:-m-6 lg:-m-8 p-2 sm:p-3 md:p-4 animate-fade-in"
      data-testid="pipeline-page"
    >
      {/* Compact toolbar: title, search, inline stats */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center shrink-0 mb-2 sm:mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight shrink-0">Pipeline</h1>
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name or phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm w-full"
              data-testid="pipeline-search"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 sm:ml-auto scrollbar-none">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 text-xs whitespace-nowrap shrink-0">
            <User className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-muted-foreground hidden sm:inline">Active</span>
            <span className="font-semibold tabular-nums">{stats.active}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-950/30 text-xs whitespace-nowrap shrink-0">
            <Trophy className="w-3.5 h-3.5 text-green-600" />
            <span className="text-muted-foreground hidden sm:inline">Won</span>
            <span className="font-semibold text-green-600 tabular-nums">{stats.won}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/30 text-xs whitespace-nowrap shrink-0">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span className="text-muted-foreground hidden sm:inline">Lost</span>
            <span className="font-semibold text-red-600 tabular-nums">{stats.lost}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs whitespace-nowrap shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(stats.revenue)}</span>
          </div>
        </div>
      </div>

      {/* Kanban board — fixed height so Won/Lost below don't shrink it */}
      <div className="h-[calc(100dvh-8rem)] min-h-[480px] sm:min-h-[560px] shrink-0 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/20 snap-x snap-mandatory">
        <div className="flex gap-2 sm:gap-3 h-full min-w-max p-2 sm:p-3">
          {KANBAN_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.value}
              title={stage.label}
              color={stage.color}
              status={stage.value}
              leads={getLeadsByStatus(stage.value)}
              count={columnsPaging[stage.value]?.total ?? getLeadsByStatus(stage.value).length}
              onCallClick={handleCallClick}
              onDrop={handleDrop}
              page={columnsPaging[stage.value]?.page}
              totalPages={columnsPaging[stage.value]?.totalPages}
              loading={columnsPaging[stage.value]?.loading}
              onPageChange={(page) => fetchLeadsForStatus(stage.value, page)}
            />
          ))}
        </div>
      </div>

      <ClosedDealsSection
        wonLeads={wonLeads}
        lostLeads={lostLeads}
        wonCount={stats.won}
        lostCount={stats.lost}
      />

      {/* Quick Action Panel */}
      <QuickActionPanel
        lead={selectedLead}
        open={quickActionOpen}
        onClose={() => {
          setQuickActionOpen(false);
          setSelectedLead(null);
        }}
        onSuccess={handleQuickActionSuccess}
        api={api}
      />
    </div>
  );
}
