import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Separator } from '../components/ui/separator';
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
import { toast } from 'sonner';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
  generateInitials,
  LEAD_STATUSES,
  CALL_OUTCOMES,
  LEAD_SOURCES,
  CLOSED_REASONS,
  STATUSES_REQUIRING_REASON,
  STATUSES_REQUIRING_ASSIGNMENT,
  isTransitionAllowed,
} from '../lib/utils';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Clock,
  Edit,
  Save,
  X,
  Loader2,
  MessageSquare,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  Building,
} from 'lucide-react';
import { Lead, Activity, CallLog, User as UserType } from '../types';

interface EditLeadData {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  source?: string;
  status?: string;
  notes?: string;
  closed_reason?: string;
  closed_reason_notes?: string;
}

interface TimelineItem {
  id: string;
  type: 'activity' | 'call' | 'booking' | 'payment';
  action: string;
  details?: string;
  user_name?: string;
  created_at: string;
  outcome?: string;
  duration?: number;
  amount?: number;
  hotel_name?: string;
  next_followup?: string;
}

interface ActivityItemProps {
  activity: TimelineItem;
}

function ActivityItem({ activity }: ActivityItemProps) {
  const getIcon = () => {
    // Check type first for specific icons
    if (activity.type === 'call') return <PhoneCall className="w-4 h-4 text-blue-500" />;
    if (activity.type === 'booking') return <Building className="w-4 h-4 text-amber-500" />;
    if (activity.type === 'payment') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    
    // Fallback to action-based icons for activities
    if (activity.action.includes('Call') || activity.action.includes('call')) return <PhoneCall className="w-4 h-4 text-blue-500" />;
    if (activity.action.includes('assigned')) return <User className="w-4 h-4 text-purple-500" />;
    if (activity.action.includes('created')) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (activity.action.includes('updated')) return <Edit className="w-4 h-4 text-orange-500" />;
    if (activity.action.includes('Booking') || activity.action.includes('booking')) return <Building className="w-4 h-4 text-amber-500" />;
    if (activity.action.includes('Payment') || activity.action.includes('payment')) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (activity.action.includes('merged')) return <User className="w-4 h-4 text-indigo-500" />;
    return <MessageSquare className="w-4 h-4 text-slate-500" />;
  };

  const getBackgroundColor = () => {
    if (activity.type === 'call') return 'bg-blue-100 dark:bg-blue-900/30';
    if (activity.type === 'booking') return 'bg-amber-100 dark:bg-amber-900/30';
    if (activity.type === 'payment') return 'bg-emerald-100 dark:bg-emerald-900/30';
    return 'bg-slate-100 dark:bg-slate-800';
  };

  const formatAction = (action: string) => {
    // Format action labels for better readability
    const actionMap: Record<string, string> = {
      'logged_call': 'Call Logged',
      'created_lead': 'Lead Created',
      'updated_lead': 'Lead Updated',
      'assigned_lead': 'Lead Assigned',
      'created_booking': 'Booking Created',
      'merged_leads': 'Leads Merged',
    };
    return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <div className={`p-2 rounded-full ${getBackgroundColor()}`}>
          {getIcon()}
        </div>
        <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-2" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-medium text-sm">{formatAction(activity.action)}</p>
            {activity.details && (
              <p className="text-sm text-muted-foreground mt-1">{activity.details}</p>
            )}
            {activity.next_followup && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Follow-up: {formatDate(activity.next_followup)}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
            {formatRelativeTime(activity.created_at)}
          </span>
        </div>
        {activity.user_name && (
          <div className="flex items-center gap-1 mt-1">
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {activity.user_name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface LogCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  currentStatus?: string;
  isAssigned?: boolean;
  onSuccess: () => void;
}

function LogCallDialog({ open, onOpenChange, leadId, currentStatus, isAssigned, onSuccess }: LogCallDialogProps) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showClosedReasonDialog, setShowClosedReasonDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState('');
  const [closedReasonNotes, setClosedReasonNotes] = useState('');
  const [formData, setFormData] = useState({
    outcome: '',
    duration_minutes: 5,
    notes: '',
    next_followup: '',
    new_status: '',
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        outcome: '',
        duration_minutes: 5,
        notes: '',
        next_followup: '',
        new_status: '',
      });
      setClosedReason('');
      setClosedReasonNotes('');
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newStatus = formData.new_status;
    
    // Check if status change requires closed reason
    if (newStatus && STATUSES_REQUIRING_REASON.includes(newStatus) && !closedReason) {
      setPendingStatus(newStatus);
      setShowClosedReasonDialog(true);
      return;
    }

    // Check transition rules
    if (newStatus && currentStatus) {
      const transitionCheck = isTransitionAllowed(currentStatus, newStatus);
      if (!transitionCheck.allowed) {
        toast.error(transitionCheck.message);
        return;
      }
    }

    // Check assignment requirement
    if (newStatus && STATUSES_REQUIRING_ASSIGNMENT.includes(newStatus) && !isAssigned) {
      toast.error(`Lead must be assigned before moving to ${getStatusLabel(newStatus)} status`);
      return;
    }

    await submitCall(newStatus, closedReason, closedReasonNotes);
  };

  const submitCall = async (statusToSet?: string, reason?: string, reasonNotes?: string) => {
    setLoading(true);
    try {
      // Log the call
      await api.post('/calls', {
        lead_id: leadId,
        outcome: formData.outcome,
        duration_minutes: formData.duration_minutes,
        notes: formData.notes,
        next_followup: formData.next_followup || null,
      });

      // Update lead status if changed
      if (statusToSet && statusToSet !== currentStatus) {
        const updateData: any = { status: statusToSet };
        if (reason) {
          updateData.closed_reason = reason;
          updateData.closed_reason_notes = reasonNotes;
        }
        await api.put(`/leads/${leadId}`, updateData);
      }

      toast.success('Call logged successfully');
      onSuccess();
      onOpenChange(false);
      setFormData({ outcome: '', duration_minutes: 5, notes: '', next_followup: '', new_status: '' });
      setClosedReason('');
      setClosedReasonNotes('');
      setShowClosedReasonDialog(false);
      setPendingStatus(null);
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail || 'Failed to log call';
      if (error.response?.data?.rule === 'closed_reason_required') {
        setPendingStatus(statusToSet || formData.new_status);
        setShowClosedReasonDialog(true);
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
    await submitCall(pendingStatus || formData.new_status, closedReason, closedReasonNotes);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="log-call-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Log Call
          </DialogTitle>
          <DialogDescription>
            Record the details of your call with this lead
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="outcome">Outcome *</Label>
              <Select
                value={formData.outcome}
                onValueChange={(value) => setFormData({ ...formData, outcome: value })}
                required
              >
                <SelectTrigger data-testid="call-outcome-select">
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
              <Label htmlFor="new_status">Change Status (Optional)</Label>
              <Select
                value={formData.new_status || "no_change"}
                onValueChange={(value) => setFormData({ ...formData, new_status: value === "no_change" ? "" : value })}
              >
                <SelectTrigger data-testid="call-status-select">
                  <SelectValue placeholder="Keep current status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_change">Keep current ({getStatusLabel(currentStatus || 'new')})</SelectItem>
                  {LEAD_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Key points from the call..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_followup">Next Follow-up</Label>
              <Input
                id="next_followup"
                type="datetime-local"
                value={formData.next_followup}
                onChange={(e) => setFormData({ ...formData, next_followup: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.outcome} data-testid="log-call-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Log Call
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Closed Reason Sub-Dialog for Log Call */}
    <Dialog open={showClosedReasonDialog} onOpenChange={setShowClosedReasonDialog}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Reason Required</DialogTitle>
          <DialogDescription>
            Please provide a reason for marking this lead as {pendingStatus === 'lost' ? 'Lost' : 'Not Interested'}.
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
              setShowClosedReasonDialog(false);
              setPendingStatus(null);
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
    </>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api, user, isTeamLead } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [editData, setEditData] = useState<EditLeadData>({});
  const [closedReasonDialogOpen, setClosedReasonDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState('');
  const [closedReasonNotes, setClosedReasonNotes] = useState('');

  useEffect(() => {
    fetchLead();
    fetchTimeline();
    fetchCalls();
    fetchUsers();
  }, [id]);

  const fetchLead = async () => {
    try {
      const response = await api.get(`/leads/${id}`);
      setLead(response.data);
      setEditData(response.data);
    } catch (error) {
      toast.error('Failed to fetch lead');
      navigate('/leads');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      const response = await api.get(`/activities?lead_id=${id}`);
      setTimeline(response.data);
    } catch (error) {
      console.error('Failed to fetch timeline:', error);
    }
  };

  const fetchCalls = async () => {
    try {
      const response = await api.get(`/calls?lead_id=${id}`);
      setCalls(response.data);
    } catch (error) {
      console.error('Failed to fetch calls:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const handleSave = async () => {
    // Check if status is changing to one that requires a reason
    const statusChanging = editData.status && editData.status !== lead?.status;
    
    // Check transition rules FIRST (Rule 5)
    if (statusChanging && lead) {
      const transitionCheck = isTransitionAllowed(lead.status, editData.status!);
      if (!transitionCheck.allowed) {
        toast.error(transitionCheck.message);
        return;
      }
    }

    // Check assignment requirement (Rule 1)
    if (statusChanging && STATUSES_REQUIRING_ASSIGNMENT.includes(editData.status!) && !lead?.assigned_to) {
      toast.error(`Lead must be assigned to a salesperson before moving to ${getStatusLabel(editData.status!)} status`);
      return;
    }

    // Check if closed reason is required (Rule 2)
    const needsReason = statusChanging && STATUSES_REQUIRING_REASON.includes(editData.status!);
    if (needsReason && !editData.closed_reason) {
      setPendingStatusChange(editData.status!);
      setClosedReasonDialogOpen(true);
      return;
    }

    setSaving(true);
    try {
      const response = await api.put(`/leads/${id}`, editData);
      setLead(response.data);
      setEditing(false);
      setEditData(response.data);
      toast.success('Lead updated successfully');
      fetchTimeline();
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail || 'Failed to update lead';
      const rule = error.response?.data?.rule;
      
      if (rule === 'closed_reason_required') {
        setPendingStatusChange(editData.status!);
        setClosedReasonDialogOpen(true);
      } else if (rule === 'assignment_required') {
        toast.error('Please assign this lead to a salesperson first');
      } else if (rule === 'notes_required_for_stage_change') {
        toast.error('Please add notes before changing the lead status');
      } else if (rule === 'stage_transition_restriction') {
        toast.error(errorDetail);
      } else {
        toast.error(errorDetail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClosedReasonSubmit = async () => {
    if (!closedReason) {
      toast.error('Please select a reason');
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        ...editData,
        status: pendingStatusChange,
        closed_reason: closedReason,
        closed_reason_notes: closedReasonNotes,
      };
      const response = await api.put(`/leads/${id}`, updateData);
      setLead(response.data);
      setEditing(false);
      setEditData(response.data);
      setClosedReasonDialogOpen(false);
      setPendingStatusChange(null);
      setClosedReason('');
      setClosedReasonNotes('');
      toast.success('Lead updated successfully');
      fetchTimeline();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (userId) => {
    try {
      await api.post(`/leads/${id}/assign`, { assignee_id: userId });
      toast.success('Lead assigned successfully');
      fetchLead();
      fetchTimeline();
    } catch (error) {
      toast.error('Failed to assign lead');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) return null;

  const salesReps = users.filter(u => ['sales_rep', 'team_lead', 'admin', 'manager'].includes(u.role));

  return (
    <div className="space-y-6 animate-fade-in" data-testid="lead-detail-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
              <Badge variant="secondary" className={getStatusColor(lead.status)}>
                {getStatusLabel(lead.status)}
              </Badge>
              {lead.is_overdue && (
                <Badge variant="destructive" className="animate-pulse">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Overdue
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Created {formatDateTime(lead.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLogCallOpen(true)} data-testid="log-call-btn">
            <Phone className="w-4 h-4 mr-2" />
            Log Call
          </Button>
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} data-testid="save-lead-btn">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)} data-testid="edit-lead-btn">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={editData.name || ''}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={editData.phone || ''}
                      onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editData.email || ''}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={editData.city || ''}
                      onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Select
                      value={editData.source}
                      onValueChange={(value) => setEditData({ ...editData, source: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((source) => (
                          <SelectItem key={source} value={source}>{source}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={editData.status}
                      onValueChange={(value) => setEditData({ ...editData, status: value })}
                    >
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
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{lead.phone}</p>
                    </div>
                  </div>
                  {lead.email && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{lead.email}</p>
                      </div>
                    </div>
                  )}
                  {lead.city && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <MapPin className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">City</p>
                        <p className="font-medium">{lead.city}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Building className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Source</p>
                      <p className="font-medium">{lead.source}</p>
                    </div>
                  </div>
                  {lead.campaign && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Campaign</p>
                        <p className="font-medium">{lead.campaign}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assignment Card */}
          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback>
                      {lead.assigned_name ? generateInitials(lead.assigned_name) : '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {lead.assigned_name || 'Unassigned'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {lead.assigned_name ? 'Assigned Rep' : 'No rep assigned'}
                    </p>
                  </div>
                </div>
                {isTeamLead && (
                  <Select onValueChange={handleAssign} value="">
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Reassign..." />
                    </SelectTrigger>
                    <SelectContent>
                      {salesReps.map((rep) => (
                        <SelectItem key={rep.id} value={rep.id}>
                          {rep.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes Card */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  rows={4}
                  placeholder="Add notes about this lead..."
                />
              ) : (
                <p className="text-muted-foreground">
                  {lead.notes || 'No notes added yet'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Call History */}
          <Card>
            <CardHeader>
              <CardTitle>Call History</CardTitle>
              <CardDescription>
                {calls.length} call{calls.length !== 1 ? 's' : ''} logged
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Phone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No calls logged yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {calls.map((call) => (
                    <div key={call.id} className="flex items-start gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className={`p-2 rounded-full ${
                        call.outcome === 'connected' 
                          ? 'bg-green-100 dark:bg-green-900/30' 
                          : 'bg-slate-100 dark:bg-slate-700'
                      }`}>
                        <Phone className={`w-4 h-4 ${
                          call.outcome === 'connected' 
                            ? 'text-green-600' 
                            : 'text-slate-500'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {call.outcome.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {call.duration_minutes} min
                          </span>
                        </div>
                        {call.notes && (
                          <p className="text-sm mt-2">{call.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {call.user_name} · {formatDateTime(call.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Activity Timeline */}
        <div className="space-y-6">
          {/* Stats */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-2xl font-bold">{lead.attempt_count}</p>
                  <p className="text-xs text-muted-foreground">Call Attempts</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-2xl font-bold">
                    {lead.hours_since_creation < 24 
                      ? `${Math.round(lead.hours_since_creation)}h`
                      : `${Math.round(lead.hours_since_creation / 24)}d`
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">Age</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Follow-up */}
          {lead.next_followup && (
            <Card className="border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Next Follow-up</p>
                    <p className="font-medium">{formatDateTime(lead.next_followup)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Timeline</CardTitle>
              <CardDescription>All activities, calls, bookings, and payments</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                {timeline.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No activity yet
                  </p>
                ) : (
                  timeline.map((item) => (
                    <ActivityItem key={`${item.type}-${item.id}`} activity={item} />
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Log Call Dialog */}
      <LogCallDialog
        open={logCallOpen}
        onOpenChange={setLogCallOpen}
        leadId={id}
        currentStatus={lead?.status}
        isAssigned={!!lead?.assigned_to}
        onSuccess={() => {
          fetchLead();
          fetchTimeline();
          fetchCalls();
        }}
      />

      {/* Closed Reason Dialog */}
      <Dialog open={closedReasonDialogOpen} onOpenChange={setClosedReasonDialogOpen}>
        <DialogContent className="sm:max-w-[450px]" data-testid="closed-reason-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Reason Required
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for marking this lead as {pendingStatusChange === 'lost' ? 'Lost' : 'Not Interested'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="closed-reason">Reason *</Label>
              <Select
                value={closedReason}
                onValueChange={setClosedReason}
              >
                <SelectTrigger data-testid="closed-reason-select">
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
              <Label htmlFor="closed-reason-notes">Additional Notes (Optional)</Label>
              <Textarea
                id="closed-reason-notes"
                value={closedReasonNotes}
                onChange={(e) => setClosedReasonNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setClosedReasonDialogOpen(false);
                setPendingStatusChange(null);
                setClosedReason('');
                setClosedReasonNotes('');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleClosedReasonSubmit} 
              disabled={saving || !closedReason}
              data-testid="closed-reason-submit"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
