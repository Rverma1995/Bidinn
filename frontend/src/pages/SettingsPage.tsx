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
  RefreshCw,
  Key,
  Eye,
  EyeOff,
  Facebook,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Trash2,
  AlertTriangle,
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
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
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
  const [metaPageId, setMetaPageId] = useState('');
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
      setMetaConfigured(response.data.configured);
      if (response.data.page_id) {
        setMetaPageId(response.data.page_id);
      }
    } catch (error) {
      console.error('Failed to fetch Meta config:', error);
    }
  };

  const handleSaveMetaConfig = async (e) => {
    e.preventDefault();
    
    if (!metaForm.app_secret || !metaForm.verify_token || !metaForm.page_access_token || !metaForm.page_id) {
      toast.error('Please fill in all Meta configuration fields');
      return;
    }

    setMetaLoading(true);
    try {
      await api.post('/meta/config', metaForm);
      toast.success('Meta Lead Ads configuration saved successfully!');
      setMetaConfigured(true);
      setMetaPageId(metaForm.page_id);
      setMetaForm({ app_secret: '', verify_token: '', page_access_token: '', page_id: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save Meta configuration');
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

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      const response = await api.post('/admin/seed-data');
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to seed data');
    } finally {
      setSeeding(false);
    }
  };

  const handleAutoReset = async () => {
    setResetting(true);
    try {
      const response = await api.post('/admin/run-auto-reset');
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to run auto-reset');
    } finally {
      setResetting(false);
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
                  Connected
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
                    <span className="font-medium">Meta Lead Ads is connected</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Page ID: {metaPageId}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Leads from your Facebook/Instagram ads will be automatically imported.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleTestMetaConnection} disabled={metaTesting}>
                    {metaTesting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                  <Button variant="outline" onClick={() => setMetaConfigured(false)}>
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
                  <p className="text-xs text-muted-foreground">
                    Use this URL in Meta Business Suite → Integrations → Webhooks
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveMetaConfig} className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    To set up Meta Lead Ads integration, you need:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
                    <li>Meta App ID and App Secret from <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Page Access Token with leads_retrieval permission</li>
                    <li>Your Facebook Page ID</li>
                  </ul>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="meta_page_id">Facebook Page ID *</Label>
                    <Input
                      id="meta_page_id"
                      placeholder="e.g., 123456789012345"
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
                      placeholder="Create a custom verify token (any string)"
                      value={metaForm.verify_token}
                      onChange={(e) => setMetaForm({ ...metaForm, verify_token: e.target.value })}
                      data-testid="meta-verify-token-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      Create any unique string - you'll enter this same token in Meta Business Suite
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta_page_token">Page Access Token *</Label>
                    <Input
                      id="meta_page_token"
                      type={showMetaSecrets ? 'text' : 'password'}
                      placeholder="Your Page Access Token"
                      value={metaForm.page_access_token}
                      onChange={(e) => setMetaForm({ ...metaForm, page_access_token: e.target.value })}
                      data-testid="meta-token-input"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={metaLoading} className="w-full" data-testid="save-meta-config-btn">
                  {metaLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Facebook className="w-4 h-4 mr-2" />
                  )}
                  Save Meta Configuration
                </Button>
              </form>
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
                <Label>Seed Demo Data</Label>
                <p className="text-sm text-muted-foreground">
                  Populate the database with sample data for demo purposes
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleSeedData}
                disabled={seeding}
                data-testid="seed-data-btn"
              >
                {seeding ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                Seed Data
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Run 30-Day Auto Reset</Label>
                <p className="text-sm text-muted-foreground">
                  Manually trigger the 30-day inactivity reset job
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleAutoReset}
                disabled={resetting}
                data-testid="auto-reset-btn"
              >
                {resetting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Run Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
