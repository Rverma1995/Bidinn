import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  CheckSquare,
  Square,
  Trash2,
  Info,
} from 'lucide-react';
import { Checkbox } from '../components/ui/checkbox';

interface CountdownBadgeProps {
  createdAt: string;
  attemptCount: number;
  status: string;
}

interface CountdownState {
  expired: boolean;
  text: string;
  mins?: number;
  secs?: number;
  urgent?: boolean;
}

function CountdownBadge({ createdAt, attemptCount, status }: CountdownBadgeProps) {
  const [countdown, setCountdown] = useState<CountdownState | null>(null);

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

interface LeadCardProps {
  lead: any;
  onClick: (lead: any) => void;
  onLogCall?: () => void;
}

function LeadCard({ lead, onClick, onLogCall }: LeadCardProps) {
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

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateLeadDialog({ open, onOpenChange, onSuccess }: CreateLeadDialogProps) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    source: '',
    campaign: '',
    city: '',
    notes: '',
  });

  // Check for duplicates when phone or email changes
  const checkForDuplicates = async () => {
    if (!formData.phone && !formData.email) {
      setDuplicates([]);
      return;
    }

    setCheckingDuplicate(true);
    try {
      const response = await api.post('/leads/check-duplicate', {
        phone: formData.phone,
        email: formData.email,
      });
      setDuplicates(response.data.duplicates || []);
    } catch (error) {
      console.error('Duplicate check error:', error);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  // Debounced duplicate check
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(checkForDuplicates, 500);
    return () => clearTimeout(timer);
  }, [formData.phone, formData.email, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // If duplicates exist, show alert - NO force create allowed
    if (duplicates.length > 0) {
      setShowDuplicateAlert(true);
      return;
    }

    setLoading(true);
    try {
      await api.post('/leads', formData);
      toast.success('Lead created successfully');
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', phone: '', email: '', source: '', campaign: '', city: '', notes: '' });
      setDuplicates([]);
      setShowDuplicateAlert(false);
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Duplicate detected by backend
        const duplicate = error.response.data.duplicate;
        if (duplicate) {
          setDuplicates([duplicate]);
        }
        setShowDuplicateAlert(true);
        toast.error('Lead already exists. Please contact Admin.');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to create lead');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMergeLead = async (targetLeadId: string) => {
    setLoading(true);
    try {
      await api.post('/leads/merge', {
        sourceLeadId: null, // No source yet since we're creating
        targetLeadId: targetLeadId,
        mergeData: {
          name: formData.name || undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          city: formData.city || undefined,
          notes: formData.notes || undefined,
        },
      });
      toast.success('Lead data merged successfully! Managers and admins have been notified.');
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', phone: '', email: '', source: '', campaign: '', city: '', notes: '' });
      setDuplicates([]);
      setShowDuplicateAlert(false);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to merge lead');
    } finally {
      setLoading(false);
    }
  };

  const resetDialog = () => {
    setFormData({ name: '', phone: '', email: '', source: '', campaign: '', city: '', notes: '' });
    setDuplicates([]);
    setShowDuplicateAlert(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetDialog();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[550px]" data-testid="create-lead-dialog">
        <DialogHeader>
          <DialogTitle>Create New Lead</DialogTitle>
          <DialogDescription>
            Add a new lead to your pipeline
          </DialogDescription>
        </DialogHeader>
        
        {/* Duplicate Alert */}
        {showDuplicateAlert && duplicates.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  Lead Already Exists
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  A lead with this phone number already exists in the system. Please contact Admin to access or reassign this lead.
                </p>
              </div>
            </div>
            <div className="space-y-2 ml-7">
              {duplicates.map((dup) => (
                <div key={dup.id} className="p-3 bg-white dark:bg-slate-800 rounded-lg border">
                  <p className="font-medium text-sm">{dup.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {dup.phone} {dup.email && `• ${dup.email}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {getStatusLabel(dup.status)} • {dup.assigned_name || 'Unassigned'}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 ml-7 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowDuplicateAlert(false);
                  setDuplicates([]);
                }}
              >
                Go Back
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {!showDuplicateAlert && (
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
                  <div className="relative">
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      data-testid="lead-phone-input"
                      className={duplicates.length > 0 ? 'border-amber-500' : ''}
                    />
                    {checkingDuplicate && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={duplicates.length > 0 && formData.email ? 'border-amber-500' : ''}
                  />
                </div>
              </div>
              
              {/* Inline duplicate warning */}
              {duplicates.length > 0 && !showDuplicateAlert && (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {duplicates.length} potential duplicate{duplicates.length > 1 ? 's' : ''} found
                </div>
              )}
              
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
        )}
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
    
    // Show progress toast for large files
    const toastId = toast.loading('Importing leads... This may take a few minutes for large files.');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 minutes - if it takes longer, proxy will timeout anyway
      });
      
      toast.dismiss(toastId);
      setResult(response.data);
      
      if (response.data.imported > 0) {
        const skippedMsg = response.data.skipped > 0 ? ` (${response.data.skipped} duplicates skipped)` : '';
        toast.success(`Successfully imported ${response.data.imported} leads!${skippedMsg}`);
        onSuccess();
      } else if (response.data.skipped > 0) {
        toast.warning(`All ${response.data.skipped} leads were duplicates and skipped.`);
      } else {
        toast.warning('No leads were imported. Check the errors below.');
      }
    } catch (error: any) {
      toast.dismiss(toastId); // Always dismiss loading toast on error
      
      // Handle specific error cases
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        toast.info('Import is still processing on the server. Please refresh the page in a moment to see imported leads.', { duration: 8000 });
        setResult({ 
          warning: true,
          message: 'Import is processing in the background. The server continues even if the connection times out. Please close this dialog and refresh the leads list in a moment.' 
        });
      } else if (error.code === 'ERR_NETWORK' || error.response?.status === 502) {
        // 502 is likely a proxy timeout - the import may still be running
        toast.info('Large file detected - import continues on the server. Please refresh in 30-60 seconds to see results.', { duration: 8000 });
        setResult({ 
          warning: true,
          message: 'For large files (500+ leads), the import continues in the background. Please close this dialog and refresh the leads list in about 30-60 seconds to see the imported leads.' 
        });
      } else {
        toast.error(error.response?.data?.detail || 'Failed to import leads');
        setResult({ error: error.response?.data?.detail || 'Import failed' });
      }
    } finally {
      toast.dismiss(toastId); // Ensure toast is dismissed
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
                : result.warning
                  ? 'bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800'
                  : result.imported > 0 
                    ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
            }`}>
              {result.error ? (
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <XCircle className="w-5 h-5" />
                  <span>{result.error}</span>
                </div>
              ) : result.warning ? (
                <div className="flex items-start gap-2 text-blue-700 dark:text-blue-300">
                  <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{result.message}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{result.imported}</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">Imported</div>
                    </div>
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{result.duplicates || 0}</div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">Duplicates</div>
                    </div>
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-red-700 dark:text-red-300">{result.errors?.length || 0}</div>
                      <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
                    </div>
                  </div>

                  {/* Duplicate Details */}
                  {result.duplicateDetails && result.duplicateDetails.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        Duplicate Leads Skipped ({result.duplicates})
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {result.duplicateDetails.slice(0, 10).map((dup: any, i: number) => (
                          <div key={i} className="text-xs p-2 bg-amber-50 dark:bg-amber-900/20 rounded flex justify-between">
                            <span className="text-amber-800 dark:text-amber-200">{dup.data?.name || 'Unknown'}</span>
                            <span className="text-amber-600 dark:text-amber-400">{dup.data?.phone} → exists as "{dup.existingLead?.name}"</span>
                          </div>
                        ))}
                        {result.duplicates > 10 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                            ...and {result.duplicates - 10} more duplicates
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error Details */}
                  {result.errors && result.errors.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-1">
                        <XCircle className="w-4 h-4" />
                        Not Imported ({result.errors.length})
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {result.errors.slice(0, 10).map((err: string, i: number) => (
                          <div key={i} className="text-xs p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-700 dark:text-red-300">
                            {err}
                          </div>
                        ))}
                        {result.errors.length > 10 && (
                          <p className="text-xs text-red-600 dark:text-red-400 italic">
                            ...and {result.errors.length - 10} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Success Message */}
                  {result.imported > 0 && (
                    <div className="border-t pt-3 flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">
                        Successfully imported {result.imported} leads!
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {result?.imported > 0 || result?.warning ? 'Done' : 'Cancel'}
          </Button>
          {!result?.imported && !result?.warning && (
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
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkNotesDialogOpen, setBulkNotesDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkStatusNotes, setBulkStatusNotes] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkNotesAppend, setBulkNotesAppend] = useState(true);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [pageSize] = useState(50);
  const [exportFilters, setExportFilters] = useState({
    status: 'all',
    source: 'all',
    assigned_to: 'all',
  });
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || 'all',
    source: searchParams.get('source') || 'all',
    assigned_to: 'all',
    search: '',
  });

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canBulkDelete = isAdmin || isManager;

  useEffect(() => {
    fetchLeads();
    fetchUsers();
  }, [filters, showUncontactedOnly, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, showUncontactedOnly]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      // If showing uncontacted leads only, use the special endpoint
      if (showUncontactedOnly) {
        try {
          const response = await api.get('/leads/uncontacted');
          setLeads(response.data);
          setTotalLeads(response.data.length);
          setTotalPages(1);
        } catch (error) {
          // Fallback if user doesn't have access to uncontacted endpoint
          const response = await api.get(`/leads?limit=1000`);
          const data = response.data.leads || response.data;
          const filtered = data.filter(l => l.is_overdue || l.attempt_count === 0);
          setLeads(filtered);
          setTotalLeads(filtered.length);
          setTotalPages(1);
        }
      } else {
        const params = new URLSearchParams();
        params.append('page', currentPage.toString());
        params.append('limit', pageSize.toString());
        if (filters.status && filters.status !== 'all') params.append('status', filters.status);
        if (filters.source && filters.source !== 'all') params.append('source', filters.source);
        if (filters.assigned_to && filters.assigned_to !== 'all') params.append('assigned_to', filters.assigned_to);
        if (filters.search) params.append('search', filters.search);

        const response = await api.get(`/leads?${params.toString()}`);
        
        // Handle both old array format and new paginated format
        if (response.data.leads) {
          setLeads(response.data.leads);
          setTotalLeads(response.data.pagination?.total || response.data.leads.length);
          setTotalPages(response.data.pagination?.totalPages || 1);
        } else {
          // Fallback for old format
          setLeads(response.data);
          setTotalLeads(response.data.length);
          setTotalPages(1);
        }
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
      await api.post(`/leads/${leadId}/assign`, { assignee_id: userId });
      toast.success('Lead assigned successfully');
      fetchLeads();
    } catch (error) {
      toast.error('Failed to assign lead');
    }
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(l => l.id));
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatus || !bulkStatusNotes || selectedLeads.length === 0) return;
    setBulkLoading(true);
    try {
      await api.post('/leads/bulk-status', {
        lead_ids: selectedLeads,
        status: bulkStatus,
        notes: bulkStatusNotes
      });
      toast.success(`Updated ${selectedLeads.length} lead(s) to ${getStatusLabel(bulkStatus)}`);
      setSelectedLeads([]);
      setBulkStatusDialogOpen(false);
      setBulkStatus('');
      setBulkStatusNotes('');
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update leads');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkNotesUpdate = async () => {
    if (!bulkNotes || selectedLeads.length === 0) return;
    setBulkLoading(true);
    try {
      await api.post('/leads/bulk-notes', {
        lead_ids: selectedLeads,
        notes: bulkNotes,
        append: bulkNotesAppend
      });
      toast.success(`Notes ${bulkNotesAppend ? 'appended to' : 'updated for'} ${selectedLeads.length} lead(s)`);
      setSelectedLeads([]);
      setBulkNotesDialogOpen(false);
      setBulkNotes('');
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update notes');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignee || selectedLeads.length === 0) return;
    setBulkLoading(true);
    try {
      await api.post('/leads/bulk-assign', {
        lead_ids: selectedLeads,
        assignee_id: bulkAssignee
      });
      const assigneeName = users.find(u => u.id === bulkAssignee)?.name || 'selected rep';
      toast.success(`Assigned ${selectedLeads.length} lead(s) to ${assigneeName}`);
      setSelectedLeads([]);
      setBulkAssignDialogOpen(false);
      setBulkAssignee('');
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign leads');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeads.length === 0) return;
    setBulkLoading(true);
    try {
      await api.post('/leads/bulk-delete', {
        lead_ids: selectedLeads,
      });
      toast.success(`Deleted ${selectedLeads.length} lead(s) successfully`);
      setSelectedLeads([]);
      setBulkDeleteDialogOpen(false);
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete leads');
    } finally {
      setBulkLoading(false);
    }
  };

  const salesReps = users.filter(u => ['sales_rep', 'team_lead'].includes(u.role));

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (exportFilters.status && exportFilters.status !== 'all') params.append('status', exportFilters.status);
      if (exportFilters.source && exportFilters.source !== 'all') params.append('source', exportFilters.source);
      if (exportFilters.assigned_to && exportFilters.assigned_to !== 'all') params.append('assigned_to', exportFilters.assigned_to);
      params.append('format', 'csv');

      const response = await api.get(`/leads/export?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Leads exported successfully');
      setExportDialogOpen(false);
    } catch (error) {
      toast.error('Failed to export leads');
    }
  };

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
        <div className="flex items-center gap-2 flex-wrap">
          {showUncontactedOnly && (
            <Button variant="outline" onClick={() => setShowUncontactedOnly(false)}>
              Show All Leads
            </Button>
          )}
          {selectedLeads.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => setBulkStatusDialogOpen(true)} data-testid="bulk-update-btn">
                Change Status ({selectedLeads.length})
              </Button>
              <Button variant="secondary" onClick={() => setBulkNotesDialogOpen(true)} data-testid="bulk-notes-btn">
                Update Notes ({selectedLeads.length})
              </Button>
              {isTeamLead && (
                <Button variant="secondary" onClick={() => setBulkAssignDialogOpen(true)} data-testid="bulk-assign-btn">
                  <User className="w-4 h-4 mr-2" />
                  Assign ({selectedLeads.length})
                </Button>
              )}
              {canBulkDelete && (
                <Button variant="destructive" onClick={() => setBulkDeleteDialogOpen(true)} data-testid="bulk-delete-btn">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete ({selectedLeads.length})
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={() => setImportDialogOpen(true)} data-testid="import-leads-btn">
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={() => setExportDialogOpen(true)} data-testid="export-leads-btn">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="create-lead-btn">
            <Plus className="w-4 h-4 mr-2" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-[450px]" data-testid="export-dialog">
          <DialogHeader>
            <DialogTitle>Export Leads</DialogTitle>
            <DialogDescription>
              Choose filters to export specific leads or export all
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={exportFilters.status} onValueChange={(value) => setExportFilters({ ...exportFilters, status: value })}>
                <SelectTrigger data-testid="export-status-filter">
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
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={exportFilters.source} onValueChange={(value) => setExportFilters({ ...exportFilters, source: value })}>
                <SelectTrigger data-testid="export-source-filter">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select value={exportFilters.assigned_to} onValueChange={(value) => setExportFilters({ ...exportFilters, assigned_to: value })}>
                <SelectTrigger data-testid="export-assigned-filter">
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} data-testid="export-submit">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkAssignDialogOpen} onOpenChange={setBulkAssignDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="bulk-assign-dialog">
          <DialogHeader>
            <DialogTitle>Bulk Assign Leads</DialogTitle>
            <DialogDescription>
              Assign {selectedLeads.length} selected lead(s) to a sales rep
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulkAssignee">Assign To</Label>
            <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
              <SelectTrigger data-testid="bulk-assign-select">
                <SelectValue placeholder="Select sales rep" />
              </SelectTrigger>
              <SelectContent>
                {salesReps.map((rep) => (
                  <SelectItem key={rep.id} value={rep.id}>
                    {rep.name} ({rep.role === 'team_lead' ? 'Team Lead' : 'Sales Rep'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkAssign} disabled={!bulkAssignee || bulkLoading} data-testid="bulk-assign-submit">
              {bulkLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assign Leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Update Dialog */}
      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="bulk-status-dialog">
          <DialogHeader>
            <DialogTitle>Bulk Status Update</DialogTitle>
            <DialogDescription>
              Update status for {selectedLeads.length} selected lead(s)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulkStatus">New Status</Label>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger data-testid="bulk-status-select">
                <SelectValue placeholder="Select status" />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkStatusUpdate} disabled={!bulkStatus || bulkLoading} data-testid="bulk-status-submit">
              {bulkLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog (Admin and Manager) */}
      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="bulk-delete-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Leads</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedLeads.length} selected lead(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              All associated calls, bookings, and activities for these leads will also be removed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkLoading} data-testid="bulk-delete-submit">
              {bulkLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {selectedLeads.length} Lead(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedLeads.length === leads.length && leads.length > 0}
                    onCheckedChange={toggleSelectAll}
                    data-testid="select-all-checkbox"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className={`table-row-interactive ${lead.is_overdue ? 'bg-red-50 dark:bg-red-900/10' : ''} ${selectedLeads.includes(lead.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                  data-testid={`lead-row-${lead.id}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedLeads.includes(lead.id)}
                      onCheckedChange={() => toggleLeadSelection(lead.id)}
                      data-testid={`lead-checkbox-${lead.id}`}
                    />
                  </TableCell>
                  <TableCell onClick={() => handleLeadClick(lead)}>
                    <div className="flex items-center gap-2">
                      {lead.is_overdue && (
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">{lead.name}</span>
                    </div>
                  </TableCell>
                  <TableCell onClick={() => handleLeadClick(lead)}>
                    <span className="text-sm">{lead.phone || '-'}</span>
                  </TableCell>
                  <TableCell onClick={() => handleLeadClick(lead)}>
                    <span className="text-sm text-muted-foreground">{lead.email || '-'}</span>
                  </TableCell>
                  <TableCell onClick={() => handleLeadClick(lead)}>
                    <span className="text-sm">{lead.campaign || '-'}</span>
                  </TableCell>
                  <TableCell onClick={() => handleLeadClick(lead)}>
                    <span className="text-sm">{lead.source || '-'}</span>
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
                  <TableCell>
                    {lead.assigned_name || (
                      <span className="text-amber-600">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatRelativeTime(lead.last_activity || lead.created_at)}
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
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalLeads)} of {totalLeads} leads
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
