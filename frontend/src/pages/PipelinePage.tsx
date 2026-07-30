import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
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
import { toast } from 'sonner';
import {
  getStatusColor,
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
} from '../lib/utils';
import {
  Loader2,
  Clock,
  Phone,
  MapPin,
  User,
  ThumbsUp,
  ThumbsDown,
  CalendarClock,
  Trophy,
  XCircle,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Voicemail,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  MoreHorizontal,
  Search,
  Filter,
} from 'lucide-react';

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

      // Update lead status if changed
      if (status !== lead.status) {
        const updateData: any = { status };
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

// Lead Card Component
function LeadCard({ lead, onCallClick, onCardClick }) {
  const [countdown, setCountdown] = useState(null);
  const showCountdown = lead.status === 'new' && lead.attempt_count === 0;

  useEffect(() => {
    if (!showCountdown) return;
    const updateCountdown = () => setCountdown(getCountdownTime(lead.created_at));
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lead.created_at, showCountdown]);

  return (
    <Link
      to={`/leads/${lead.id}`}
      className={`group block p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all hover:shadow-lg cursor-pointer no-underline text-inherit ${
        lead.is_overdue ? 'border-red-300 dark:border-red-700 ring-1 ring-red-200 dark:ring-red-800' : 'border-slate-200 dark:border-slate-700 hover:border-primary/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {generateInitials(lead.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-sm">{lead.name}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {lead.phone}
            </p>
          </div>
        </div>
        {showCountdown && countdown && (
          <Badge className={`text-xs ${
            countdown.expired 
              ? 'bg-red-500 text-white animate-pulse' 
              : countdown.urgent 
                ? 'bg-amber-500 text-white' 
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}>
            <Clock className="w-3 h-3 mr-1" />
            {countdown.text}
          </Badge>
        )}
      </div>

      {/* Info Row */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        {lead.city && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {lead.city}
          </span>
        )}
        <span>•</span>
        <span>{lead.source}</span>
        {lead.attempt_count > 0 && (
          <>
            <span>•</span>
            <span>{lead.attempt_count} calls</span>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs text-muted-foreground">
          {lead.assigned_name ? (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {lead.assigned_name.split(' ')[0]}
            </span>
          ) : (
            <span className="text-amber-600">Unassigned</span>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onCallClick(lead);
          }}
        >
          <PhoneCall className="w-4 h-4 mr-1" />
          Log Call
        </Button>
      </div>
    </Link>
  );
}

// Pipeline Column Component
interface PipelineColumnProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  color: string;
  leads: any[];
  count: number;
  onCallClick: (lead: any) => void;
  onCardClick: (lead: any) => void;
  onDrop: (e: React.DragEvent, newStatus: string) => void;
  status: string;
  page?: number;
  totalPages?: number;
  loading?: boolean;
  onPageChange?: (page: number) => void;
}

function PipelineColumn({ title, icon: Icon, color, leads, count, onCallClick, onCardClick, onDrop, status, page = 1, totalPages = 1, loading, onPageChange }: PipelineColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const colorClasses = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    slate: 'bg-slate-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <div
      className={`flex flex-col flex-1 min-w-[300px] max-w-[380px] h-full rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border ${
        isDragOver ? 'border-primary border-dashed bg-primary/5' : 'border-transparent'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(e, status); }}
    >
      {/* Column Header */}
      <div className="p-4 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${colorClasses[color]}`} />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {count}
          </Badge>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1" style={{ height: 'calc(100% - 60px)' }}>
        <div className="p-3 space-y-3 pb-8">
          {leads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No leads in this stage
            </div>
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
                <LeadCard
                  lead={lead}
                  onCallClick={onCallClick}
                  onCardClick={onCardClick}
                />
              </div>
            ))
          )}
          {loading && (
            <div className="text-center py-2 text-xs text-muted-foreground">
              Loading...
            </div>
          )}
        </div>
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-b-2xl">
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={page <= 1 || loading}
            onClick={() => onPageChange?.(page - 1)}
          >
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange?.(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
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
    const statuses = [...ACTIVE_PIPELINE_STATUSES.map(s => s.value), 'won', 'lost'];
    await Promise.all(statuses.map(s => fetchLeadsForStatus(s)));
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
      await api.put(`/leads/${leadId}`, { status: newStatus });
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

  const handleCardClick = (lead) => {
    navigate(`/leads/${lead.id}`);
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const wonLeads = getLeadsByStatus('won');
  const lostLeads = getLeadsByStatus('lost');

  return (
    <div className="space-y-6 animate-fade-in" data-testid="pipeline-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground">
            Track and manage your leads through the sales process
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Leads</p>
                <p className="text-2xl font-bold">
                  {stats.active}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <User className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Won</p>
                <p className="text-2xl font-bold text-green-600">{stats.won}</p>
              </div>
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Trophy className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lost</p>
                <p className="text-2xl font-bold text-red-600">{stats.lost}</p>
              </div>
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.revenue)}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Kanban */}
      <div className="overflow-x-auto pb-4" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
        <div className="flex gap-4 min-w-max h-full">
          {ACTIVE_PIPELINE_STATUSES.map((stage) => (
            <PipelineColumn
              key={stage.value}
              title={stage.label}
              color={stage.color}
              status={stage.value}
              leads={getLeadsByStatus(stage.value)}
              count={columnsPaging[stage.value]?.total ?? getLeadsByStatus(stage.value).length}
              onCallClick={handleCallClick}
              onCardClick={handleCardClick}
              onDrop={handleDrop}
              page={columnsPaging[stage.value]?.page}
              totalPages={columnsPaging[stage.value]?.totalPages}
              loading={columnsPaging[stage.value]?.loading}
              onPageChange={(page) => fetchLeadsForStatus(stage.value, page)}
            />
          ))}
        </div>
      </div>

      {/* Closed Deals Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Won Deals */}
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <Trophy className="w-5 h-5" />
              Won ({stats.won})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {wonLeads.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No won deals yet</p>
              ) : (
                <div className="space-y-2">
                  {wonLeads.slice(0, 10).map((lead) => (
                    <Link
                      to={`/leads/${lead.id}`}
                      key={lead.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/10 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/20 no-underline text-inherit"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <div>
                          <p className="font-medium text-sm">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.source}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Lost Deals */}
        <Card className="border-red-200 dark:border-red-900/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle className="w-5 h-5" />
              Lost ({stats.lost})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {lostLeads.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No lost deals</p>
              ) : (
                <div className="space-y-2">
                  {lostLeads.slice(0, 10).map((lead) => (
                    <Link
                      to={`/leads/${lead.id}`}
                      key={lead.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/10 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/20 no-underline text-inherit"
                    >
                      <div className="flex items-center gap-3">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <div>
                          <p className="font-medium text-sm">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.source}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

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
