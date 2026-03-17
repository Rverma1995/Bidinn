import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { generateInitials, getRoleLabel } from '../lib/utils';
import {
  User,
  Moon,
  Sun,
  Bell,
  Shield,
  Database,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Facebook,
  CheckCircle2,
  ExternalLink,
  Download,
  Trash2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export default function SettingsPage() {
  const { user, api, isAdmin } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  // Meta Lead Ads state
  const [metaConfigured, setMetaConfigured] = useState(false);
  const [metaStep, setMetaStep] = useState(1); // 1 = Page ID & App Secret, 2 = Verify Token
  const [metaPageId, setMetaPageId] = useState('');
  const [metaAppSecretSaved, setMetaAppSecretSaved] = useState(false);
  const [metaVerified, setMetaVerified] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaTesting, setMetaTesting] = useState(false);
  const [showMetaSecrets, setShowMetaSecrets] = useState(false);
  const [metaForm, setMetaForm] = useState({
    app_secret: '',
    verify_token: '',
    page_access_token: '',
    page_id: '',
  });

  useEffect(() => {
    if (isAdmin) {
      fetchMetaConfig();
    }
  }, [isAdmin]);

  const fetchMetaConfig = async () => {
    try {
      const response = await api.get('/meta/config');
      const config = response.data;
      
      if (config.page_id) {
        setMetaPageId(config.page_id);
        setMetaForm(prev => ({ ...prev, page_id: config.page_id }));
      }
      
      if (config.app_secret === '***configured***') {
        setMetaAppSecretSaved(true);
        setMetaStep(2); // Move to step 2 if App Secret is already saved
      }
      
      if (config.verify_token) {
        setMetaVerified(true);
      }
      
      if (config.is_active && config.verify_token) {
        setMetaConfigured(true);
      }
    } catch (error) {
      console.error('Failed to fetch Meta config:', error);
    }
  };

  // Step 1: Save Page ID and App Secret
  const handleSaveStep1 = async (e) => {
    e.preventDefault();
    
    if (!metaForm.page_id || !metaForm.app_secret) {
      toast.error('Please fill in Page ID and App Secret');
      return;
    }

    setMetaLoading(true);
    try {
      await api.post('/meta/config', {
        page_id: metaForm.page_id,
        app_secret: metaForm.app_secret,
        is_active: false, // Not active until verify token is set
      });
      toast.success('Step 1 Complete! Page ID and App Secret saved.');
      setMetaAppSecretSaved(true);
      setMetaPageId(metaForm.page_id);
      setMetaStep(2);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setMetaLoading(false);
    }
  };

  // Step 2: Save Verify Token (after Meta verification)
  const handleSaveStep2 = async (e) => {
    e.preventDefault();
    
    if (!metaForm.verify_token) {
      toast.error('Please enter the Verify Token');
      return;
    }

    setMetaLoading(true);
    try {
      await api.post('/meta/config', {
        verify_token: metaForm.verify_token,
        is_active: true, // Now activate the integration
      });
      toast.success('Meta Lead Ads integration is now active!');
      setMetaConfigured(true);
      setMetaVerified(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save verify token');
    } finally {
      setMetaLoading(false);
    }
  };

  const handleTestMetaConnection = async () => {
    setMetaTesting(true);
    try {
      const response = await api.post('/meta/test-connection');
      toast.success(`Connected to Facebook Page: ${response.data.page_name}`);
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.detail || 'Failed to connect to Meta');
    } finally {
      setMetaTesting(false);
    }
  };

  const handleResetMetaConfig = () => {
    setMetaStep(1);
    setMetaAppSecretSaved(false);
    setMetaVerified(false);
    setMetaConfigured(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });
      toast.success('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleExportDatabase = async () => {
    setExporting(true);
    try {
      const response = await api.get('/admin/export-database', {
        responseType: 'blob',
      });
      
      // Create download link
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bidinn-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Database exported successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to export database');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteDatabase = async () => {
    if (deleteConfirmText !== 'DELETE ALL DATA') {
      toast.error('Please type "DELETE ALL DATA" to confirm');
      return;
    }
    
    setDeleting(true);
    try {
      const response = await api.delete('/admin/delete-database');
      toast.success(response.data.message);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete database');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="w-20 h-20">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {generateInitials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-xl font-semibold">{user?.name}</h3>
              <p className="text-muted-foreground">{user?.email}</p>
              <p className="text-sm text-primary mt-1">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={user?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ''} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  className="pr-10"
                  data-testid="current-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="pr-10"
                  data-testid="new-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                data-testid="confirm-password-input"
              />
            </div>
            <Button type="submit" disabled={changingPassword} data-testid="change-password-btn">
              {changingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            Appearance
          </CardTitle>
          <CardDescription>Customize how Bidinn looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Dark Mode</Label>
              <p className="text-sm text-muted-foreground">
                Switch between light and dark themes
              </p>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={toggleTheme}
              data-testid="theme-switch"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </CardTitle>
          <CardDescription>Configure notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive email alerts for important events
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Lead Assignment Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when leads are assigned to you
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Follow-up Reminders</Label>
              <p className="text-sm text-muted-foreground">
                Receive reminders for upcoming follow-ups
              </p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Meta Lead Ads Integration - Admin Only */}
      {isAdmin && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Facebook className="w-5 h-5" />
              Meta Lead Ads Integration
              {metaConfigured && (
                <Badge variant="outline" className="ml-2 text-emerald-600 border-emerald-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Connect your Facebook/Instagram Lead Ads to automatically import leads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {metaConfigured ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Meta Lead Ads is active</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Page ID: {metaPageId}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Leads from your Facebook/Instagram ads will be automatically imported.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleResetMetaConfig}>
                    Update Configuration
                  </Button>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Webhook URL (for Meta Business Suite)</Label>
                  <div className="flex gap-2">
                    <Input 
                      readOnly 
                      value={`${window.location.origin}/api/meta/webhook`}
                      className="font-mono text-sm"
                    />
                    <Button 
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/meta/webhook`);
                        toast.success('Webhook URL copied!');
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-4">
                  <div className={`flex items-center gap-2 ${metaStep >= 1 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${metaStep >= 1 ? 'bg-blue-600 text-white' : 'bg-muted'}`}>
                      {metaAppSecretSaved ? <CheckCircle2 className="w-5 h-5" /> : '1'}
                    </div>
                    <span className="text-sm font-medium">Page ID & App Secret</span>
                  </div>
                  <div className={`w-12 h-0.5 ${metaStep >= 2 ? 'bg-blue-600' : 'bg-muted'}`} />
                  <div className={`flex items-center gap-2 ${metaStep >= 2 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${metaStep >= 2 ? 'bg-blue-600 text-white' : 'bg-muted'}`}>
                      {metaVerified ? <CheckCircle2 className="w-5 h-5" /> : '2'}
                    </div>
                    <span className="text-sm font-medium">Verify Token</span>
                  </div>
                </div>

                {/* Step 1: Page ID, App Secret, and Verify Token */}
                {metaStep === 1 && (
                  <form onSubmit={handleSaveStep1} className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        Step 1: Enter your Meta App credentials
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Get Page ID and App Secret from <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="w-3 h-3" /></a>
                      </p>
                    </div>
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="meta_page_id">Facebook Page ID *</Label>
                        <Input
                          id="meta_page_id"
                          placeholder="e.g., 110397928744165"
                          value={metaForm.page_id}
                          onChange={(e) => setMetaForm({ ...metaForm, page_id: e.target.value })}
                          data-testid="meta-page-id-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="meta_app_secret">App Secret *</Label>
                        <div className="relative">
                          <Input
                            id="meta_app_secret"
                            type={showMetaSecrets ? 'text' : 'password'}
                            placeholder="Your Meta App Secret"
                            value={metaForm.app_secret}
                            onChange={(e) => setMetaForm({ ...metaForm, app_secret: e.target.value })}
                            className="pr-10"
                            data-testid="meta-app-secret-input"
                          />
                          <button
                            type="button"
                            onClick={() => setShowMetaSecrets(!showMetaSecrets)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showMetaSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="meta_verify_token">Verify Token *</Label>
                        <Input
                          id="meta_verify_token"
                          type={showMetaSecrets ? 'text' : 'password'}
                          placeholder="e.g., bidinncrm"
                          value={metaForm.verify_token}
                          onChange={(e) => setMetaForm({ ...metaForm, verify_token: e.target.value })}
                          data-testid="meta-verify-token-input"
                        />
                        <p className="text-xs text-muted-foreground">
                          Create a unique token - you'll enter this same token in Meta Business Suite
                        </p>
                      </div>
                    </div>
                    <Button type="submit" disabled={metaLoading} className="w-full" data-testid="save-step1-btn">
                      {metaLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Save Configuration
                    </Button>
                  </form>
                )}

                {/* Step 2: Verify Token */}
                {metaStep === 2 && (
                  <div className="space-y-4">
                    {/* Webhook URL - Show first so user can set it in Meta */}
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                        Step 2a: Add Webhook URL in Meta Business Suite
                      </p>
                      <div className="flex gap-2">
                        <Input 
                          readOnly 
                          value={`${window.location.origin}/api/meta/webhook`}
                          className="font-mono text-sm bg-white dark:bg-slate-900"
                        />
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/api/meta/webhook`);
                            toast.success('Webhook URL copied!');
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Go to Meta Business Suite → Integrations → Webhooks → Add this URL
                      </p>
                    </div>

                    <form onSubmit={handleSaveStep2} className="space-y-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                          Step 2b: Enter the Verify Token
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Create a unique token and enter the same in both Meta and here
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="meta_verify_token">Verify Token *</Label>
                        <Input
                          id="meta_verify_token"
                          type={showMetaSecrets ? 'text' : 'password'}
                          placeholder="Create a unique verify token (e.g., bidinn_verify_2024)"
                          value={metaForm.verify_token}
                          onChange={(e) => setMetaForm({ ...metaForm, verify_token: e.target.value })}
                          data-testid="meta-verify-token-input"
                        />
                        <p className="text-xs text-muted-foreground">
                          This must match exactly what you enter in Meta Business Suite
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setMetaStep(1)}>
                          Back to Step 1
                        </Button>
                        <Button type="submit" disabled={metaLoading} className="flex-1" data-testid="save-step2-btn">
                          {metaLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                          )}
                          Activate Integration
                        </Button>
                      </div>
                    </form>

                    {/* Status indicator */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Page ID:</span> {metaPageId}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">App Secret:</span> ✓ Saved
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin Section */}
      {isAdmin && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <Shield className="w-5 h-5" />
              Admin Actions
            </CardTitle>
            <CardDescription>Administrative functions (Admin only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Export Database</Label>
                <p className="text-sm text-muted-foreground">
                  Download all data as a JSON backup file
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleExportDatabase}
                disabled={exporting}
                data-testid="export-database-btn"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Export Data
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-red-600">Delete All Data</Label>
                <p className="text-sm text-muted-foreground">
                  Permanently delete all leads, bookings, payments, and activities
                </p>
              </div>
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="delete-database-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent data-testid="delete-database-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Delete All Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                This action will <strong>permanently delete</strong> all:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Leads and their history</li>
                <li>Bookings</li>
                <li>Payments</li>
                <li>Call logs</li>
                <li>Activities</li>
                <li>Notifications</li>
              </ul>
              <p className="text-red-600 font-medium">
                This action cannot be undone! Make sure to export a backup first.
              </p>
              <div className="pt-2">
                <Label htmlFor="delete-confirm">Type "DELETE ALL DATA" to confirm:</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE ALL DATA"
                  className="mt-2"
                  data-testid="delete-confirm-input"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteDatabase}
              disabled={deleting || deleteConfirmText !== 'DELETE ALL DATA'}
              data-testid="confirm-delete-btn"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Everything
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>System configuration status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Telephony Integration</Label>
              <p className="text-sm text-muted-foreground">
                Smartflo telephony integration (Future feature)
              </p>
            </div>
            <Switch disabled checked={false} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
