import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import {
  getStatusColor,
  getStatusLabel,
  formatRelativeTime,
  getCountdownTime,
  LEAD_STATUSES,
} from '../lib/utils';
import {
  Loader2,
  Clock,
  Phone,
  MapPin,
  User,
  GripVertical,
} from 'lucide-react';

const PIPELINE_STAGES = LEAD_STATUSES.filter(s => 
  !['closed_won', 'closed_lost'].includes(s.value)
);

function LeadCard({ lead, onClick, onDragStart, onDragEnd }) {
  const [countdown, setCountdown] = useState(null);
  const showCountdown = lead.status === 'new' && lead.attempt_count === 0;

  useEffect(() => {
    if (!showCountdown) return;

    const updateCountdown = () => {
      setCountdown(getCountdownTime(lead.created_at));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lead.created_at, showCountdown]);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      className={`p-3 rounded-lg border bg-white dark:bg-slate-900 cursor-move hover:shadow-md transition-all ${
        lead.is_overdue ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700'
      }`}
      onClick={() => onClick(lead)}
      data-testid={`pipeline-card-${lead.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{lead.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {lead.phone}
          </p>
        </div>
        <GripVertical className="w-4 h-4 text-slate-400 cursor-grab flex-shrink-0" />
      </div>

      {showCountdown && countdown && (
        <Badge className={`mb-2 text-xs ${
          countdown.expired 
            ? 'bg-red-500 text-white' 
            : countdown.urgent 
              ? 'bg-amber-500 text-white badge-pulse' 
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
        }`}>
          <Clock className="w-3 h-3 mr-1" />
          {countdown.text}
        </Badge>
      )}

      {lead.city && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
          <MapPin className="w-3 h-3" />
          {lead.city}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-slate-100 dark:border-slate-800">
        <span className="flex items-center gap-1">
          {lead.assigned_name ? (
            <>
              <User className="w-3 h-3" />
              {lead.assigned_name.split(' ')[0]}
            </>
          ) : (
            <span className="text-amber-600">Unassigned</span>
          )}
        </span>
        <span>{formatRelativeTime(lead.last_activity || lead.created_at)}</span>
      </div>
    </div>
  );
}

function PipelineColumn({ stage, leads, onLeadClick, onDrop, onDragStart, onDragEnd }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e, stage.value);
  };

  const stageColor = {
    new: 'bg-blue-500',
    contacted: 'bg-cyan-500',
    qualified: 'bg-purple-500',
    proposal: 'bg-amber-500',
    negotiation: 'bg-orange-500',
  };

  return (
    <div
      className={`flex flex-col min-w-[280px] max-w-[320px] rounded-xl bg-slate-50 dark:bg-slate-800/50 transition-all ${
        isDragOver ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`pipeline-column-${stage.value}`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${stageColor[stage.value] || 'bg-slate-500'}`} />
            <h3 className="font-medium text-sm">{stage.label}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {leads.length}
          </Badge>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2 min-h-[400px]">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={onLeadClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No leads in this stage
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function PipelinePage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const response = await api.get('/leads');
      setLeads(response.data);
    } catch (error) {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
    // Add a slight delay for visual feedback
    setTimeout(() => {
      e.target.classList.add('opacity-50');
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('opacity-50');
    setDraggedLead(null);
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    
    if (!draggedLead || draggedLead.status === newStatus) return;

    // Optimistic update
    setLeads(prev => prev.map(l => 
      l.id === draggedLead.id ? { ...l, status: newStatus } : l
    ));

    try {
      await api.put(`/leads/${draggedLead.id}`, { status: newStatus });
      toast.success(`Lead moved to ${getStatusLabel(newStatus)}`);
    } catch (error) {
      // Revert on error
      setLeads(prev => prev.map(l => 
        l.id === draggedLead.id ? { ...l, status: draggedLead.status } : l
      ));
      toast.error('Failed to update lead');
    }
  };

  const handleLeadClick = (lead) => {
    navigate(`/leads/${lead.id}`);
  };

  const getLeadsByStage = (stage) => {
    return leads.filter(l => l.status === stage);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="pipeline-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground">
          Drag and drop leads between stages
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {PIPELINE_STAGES.map((stage) => {
          const count = getLeadsByStage(stage.value).length;
          return (
            <Card key={stage.value}>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium">{stage.label}</span>
                <Badge variant="secondary">{count}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.value}
              stage={stage}
              leads={getLeadsByStage(stage.value)}
              onLeadClick={handleLeadClick}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>

      {/* Closed Deals Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Closed Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Closed Won</span>
                <Badge className="bg-emerald-500 text-white">
                  {leads.filter(l => l.status === 'closed_won').length}
                </Badge>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-700 dark:text-red-300">Closed Lost</span>
                <Badge className="bg-red-500 text-white">
                  {leads.filter(l => l.status === 'closed_lost').length}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
