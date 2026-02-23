import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  formatDate,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
  getCountdownTime,
  LEAD_STATUSES,
  LEAD_SOURCES,
  truncateText,
} from '../lib/utils';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Phone,
  Mail,
  MapPin,
  Clock,
  User,
  Calendar,
  Loader2,
  Grid3X3,
  List,
  ChevronRight,
  AlertTriangle,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Download,
} from 'lucide-react';

function CountdownBadge({ createdAt, attemptCount, status }) {
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (status !== 'new' || attemptCount > 0) return;

    const updateCountdown = () => {
      setCountdown(getCountdownTime(createdAt));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [createdAt, attemptCount, status]);

  if (status !== 'new' || attemptCount > 0 || !countdown) return null;

  return (
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
  );
}

function LeadCard({ lead, onClick, onLogCall }) {
  return (
    <Card 
      className={`card-hover cursor-pointer pipeline-${lead.status} ${
        lead.is_overdue ? 'ring-2 ring-red-500' : ''
      }`}
      onClick={() => onClick(lead)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{lead.name}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {lead.phone}
            </p>
          </div>
          <CountdownBadge 
            createdAt={lead.created_at} 
            attemptCount={lead.attempt_count}
            status={lead.status}
          />
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className={getStatusColor(lead.status)}>
            {getStatusLabel(lead.status)}
          </Badge>
          <span className="text-xs text-muted-foreground">{lead.source}</span>
        </div>

        {lead.city && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3" />
            {lead.city}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            {lead.assigned_name ? (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {lead.assigned_name}
              </span>
            ) : (
              <span className="text-amber-600">Unassigned</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatRelativeTime(lead.last_activity || lead.created_at)}
          </div>
        </div>

        {lead.next_followup && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3 text-primary" />
              Follow-up: {formatDate(lead.next_followup)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateLeadDialog({ open, onOpenChange, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    source: '',
    campaign: '',
    city: '',
    notes: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/leads', formData);
      toast.success('Lead created successfully');
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', phone: '', email: '', source: '', campaign: '', city: '', notes: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="create-lead-dialog">
        <DialogHeader>
          <DialogTitle>Create New Lead</DialogTitle>
          <DialogDescription>
            Add a new lead to your pipeline
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  data-testid="lead-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  data-testid="lead-phone-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source">Source *</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                  required
                >
                  <SelectTrigger data-testid="lead-source-select">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign</Label>
              <Input
                id="campaign"
                value={formData.campaign}
                onChange={(e) => setFormData({ ...formData, campaign: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="create-lead-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportLeadsDialog({ open, onOpenChange, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const fileName = selectedFile.name.toLowerCase();
    if (!validTypes.some(type => fileName.endsWith(type))) {
      toast.error('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }
    setFile(selectedFile);
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleImport = async () => {
    if (!file) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setResult(response.data);
      
      if (response.data.imported > 0) {
        toast.success(`Successfully imported ${response.data.imported} leads!`);
        onSuccess();
      } else {
        toast.warning('No leads were imported. Check the errors below.');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to import leads');
      setResult({ error: error.response?.data?.detail || 'Import failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const csvContent = "name,phone,email,source,campaign,city,notes\nAcme Corporation,+1-555-123-4567,contact@acme.com,Google Ads,Summer Sale,New York,Interested in premium package\nTech Startup Inc,+1-555-987-6543,hello@techstartup.com,LinkedIn,Q4 Campaign,San Francisco,Budget: $10000";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]" data-testid="import-leads-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Leads
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to bulk import leads
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* File Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver 
                ? 'border-primary bg-primary/5' 
                : file 
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' 
                  : 'border-slate-200 dark:border-slate-700 hover:border-primary'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFile(null); setResult(null); }}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop your file here, or
                </p>
                <label>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span className="cursor-pointer">Browse Files</span>
                  </Button>
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports CSV, Excel (.xlsx, .xls)
                </p>
              </>
            )}
          </div>

          {/* Template Download */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div>
              <p className="text-sm font-medium">Need a template?</p>
              <p className="text-xs text-muted-foreground">Download our CSV template with example data</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Template
            </Button>
          </div>

          {/* Required Columns Info */}
          <div className="text-sm">
            <p className="font-medium mb-2">Column Requirements:</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">name *</Badge>
              <Badge variant="default">phone *</Badge>
              <Badge variant="secondary">email</Badge>
              <Badge variant="secondary">source</Badge>
              <Badge variant="secondary">campaign</Badge>
              <Badge variant="secondary">city</Badge>
              <Badge variant="secondary">notes</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">* Required columns</p>
          </div>

          {/* Import Result */}
          {result && (
            <div className={`p-4 rounded-lg ${
              result.error 
                ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800' 
                : result.imported > 0 
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
            }`}>
              {result.error ? (
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <XCircle className="w-5 h-5" />
                  <span>{result.error}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">{result.imported} imported</span>
                    </div>
                    {result.skipped > 0 && (
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{result.skipped} skipped</span>
                      </div>
                    )}
                  </div>
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-2 text-sm">
                      <p className="text-muted-foreground mb-1">Issues:</p>
                      <ul className="text-xs text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                        {result.errors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {result?.imported > 0 ? 'Done' : 'Cancel'}
          </Button>
          {!result?.imported && (
            <Button onClick={handleImport} disabled={!file || loading} data-testid="import-leads-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import Leads
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadsPage() {
  const { api, user, isTeamLead } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [showUncontactedOnly, setShowUncontactedOnly] = useState(searchParams.get('filter') === 'uncontacted');
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || 'all',
    source: searchParams.get('source') || 'all',
    assigned_to: 'all',
    search: '',
  });

  useEffect(() => {
    fetchLeads();
    fetchUsers();
  }, [filters, showUncontactedOnly]);

  const fetchLeads = async () => {
    try {
      // If showing uncontacted leads only, use the special endpoint
      if (showUncontactedOnly) {
        try {
          const response = await api.get('/leads/uncontacted');
          setLeads(response.data);
        } catch (error) {
          // Fallback if user doesn't have access to uncontacted endpoint
          const response = await api.get('/leads?status=new');
          const filtered = response.data.filter(l => l.is_overdue || l.attempt_count === 0);
          setLeads(filtered);
        }
      } else {
        const params = new URLSearchParams();
        if (filters.status && filters.status !== 'all') params.append('status', filters.status);
        if (filters.source && filters.source !== 'all') params.append('source', filters.source);
        if (filters.assigned_to && filters.assigned_to !== 'all') params.append('assigned_to', filters.assigned_to);
        if (filters.search) params.append('search', filters.search);

        const response = await api.get(`/leads?${params.toString()}`);
        setLeads(response.data);
      }
    } catch (error) {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
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

  const handleLeadClick = (lead) => {
    navigate(`/leads/${lead.id}`);
  };

  const handleAssign = async (leadId, userId) => {
    try {
      await api.post(`/leads/${leadId}/assign?assignee_id=${userId}`);
      toast.success('Lead assigned successfully');
      fetchLeads();
    } catch (error) {
      toast.error('Failed to assign lead');
    }
  };

  const salesReps = users.filter(u => ['sales_rep', 'team_lead'].includes(u.role));

  return (
    <div className="space-y-6 animate-fade-in" data-testid="leads-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {showUncontactedOnly ? 'Uncontacted Leads (>1hr)' : 'Leads'}
          </h1>
          <p className="text-muted-foreground">
            {showUncontactedOnly 
              ? 'Leads that need immediate attention' 
              : 'Manage and track your sales leads'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showUncontactedOnly && (
            <Button variant="outline" onClick={() => setShowUncontactedOnly(false)}>
              Show All Leads
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportDialogOpen(true)} data-testid="import-leads-btn">
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="create-lead-btn">
            <Plus className="w-4 h-4 mr-2" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Uncontacted Alert Banner */}
      {showUncontactedOnly && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-300">
              These leads have been waiting for over 1 hour without contact. Please prioritize reaching out to them.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {!showUncontactedOnly && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
                data-testid="leads-search"
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-full sm:w-40" data-testid="status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.source}
              onValueChange={(value) => setFilters({ ...filters, source: value })}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {LEAD_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isTeamLead && (
              <Select
                value={filters.assigned_to}
                onValueChange={(value) => setFilters({ ...filters, assigned_to: value })}
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  {salesReps.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Leads Display */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No leads found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your filters or create a new lead
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Lead
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={handleLeadClick} />
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className={`table-row-interactive ${lead.is_overdue ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                  onClick={() => handleLeadClick(lead)}
                  data-testid={`lead-row-${lead.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {lead.is_overdue && (
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-sm text-muted-foreground">{lead.phone}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={getStatusColor(lead.status)}>
                        {getStatusLabel(lead.status)}
                      </Badge>
                      <CountdownBadge
                        createdAt={lead.created_at}
                        attemptCount={lead.attempt_count}
                        status={lead.status}
                      />
                    </div>
                  </TableCell>
                  <TableCell>{lead.source}</TableCell>
                  <TableCell>
                    {lead.assigned_name || (
                      <span className="text-amber-600">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatRelativeTime(lead.last_activity || lead.created_at)}
                  </TableCell>
                  <TableCell>
                    {lead.next_followup ? formatDate(lead.next_followup) : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleLeadClick(lead); }}>
                          View Details
                        </DropdownMenuItem>
                        {isTeamLead && (
                          <>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              Assign to...
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Lead Dialog */}
      <CreateLeadDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchLeads}
      />

      {/* Import Leads Dialog */}
      <ImportLeadsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={fetchLeads}
      />
    </div>
  );
}
