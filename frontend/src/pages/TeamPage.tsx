import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
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
import { toast } from 'sonner';
import {
  formatCurrency,
  formatNumber,
  generateInitials,
  getRoleLabel,
  getRoleBadgeColor,
} from '../lib/utils';
import {
  Loader2,
  Trophy,
  Medal,
  Phone,
  Users,
  TrendingUp,
  Target,
  Plus,
  UserPlus,
  Eye,
  EyeOff,
  MoreVertical,
  UserX,
  UserCheck,
  KeyRound,
  Shield,
  Edit,
} from 'lucide-react';

function LeaderboardCard({ entry, rank }) {
  const getRankIcon = () => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-amber-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">{rank}</span>;
  };

  const getRankBg = () => {
    if (rank === 1) return 'bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800';
    if (rank === 2) return 'bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 border-slate-200 dark:border-slate-700';
    if (rank === 3) return 'bg-gradient-to-r from-amber-50/50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border-amber-200/50 dark:border-amber-800/50';
  return '';
  };

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md ${getRankBg()}`}>
      <div className="flex items-center justify-center w-10 h-10">
        {getRankIcon()}
      </div>
      <Avatar className="w-12 h-12 ring-2 ring-white dark:ring-slate-800 shadow-sm">
        <AvatarImage src={entry.avatar} alt={entry.user_name} />
        <AvatarFallback className="bg-primary text-primary-foreground">
          {generateInitials(entry.user_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{entry.user_name}</p>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            {entry.leads_closed} closed
          </span>
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {entry.calls_made} calls
          </span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(entry.revenue)}
        </p>
        <p className="text-sm text-muted-foreground">
          {(entry.conversion_rate || 0).toFixed(1)}% conv.
        </p>
      </div>
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'sales_rep',
    tata_extension: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users', formData);
      toast.success(`${formData.name} added to the team!`);
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', email: '', password: '', role: 'sales_rep', tata_extension: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]" data-testid="create-user-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add Team Member
          </DialogTitle>
          <DialogDescription>
            Create a new user account for your team
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="user-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@bidinn.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                data-testid="user-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="pr-10"
                  data-testid="user-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger data-testid="user-role-select">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_rep">Sales Rep</SelectItem>
                  <SelectItem value="team_lead">Team Lead</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tata_extension">Tata Extension</Label>
              <Input
                id="tata_extension"
                placeholder="e.g. 1001"
                value={formData.tata_extension}
                onChange={(e) => setFormData({ ...formData, tata_extension: e.target.value })}
                data-testid="user-tata-extension-input"
              />
              <p className="text-xs text-muted-foreground">Smartflo agent extension for click-to-call</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="create-user-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ open, onOpenChange, user, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: newPassword });
      toast.success(`Password reset for ${user.name}`);
      onSuccess();
      onOpenChange(false);
      setNewPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" data-testid="reset-password-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Reset Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for {user?.name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password *</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="pr-10"
                  data-testid="new-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="reset-password-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ open, onOpenChange, user, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    tata_extension: '',
  });

  // Update form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        tata_extension: user.tata_extension || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Email is required');
      return;
    }
    setLoading(true);
    try {
      await api.put(`/users/${user.id}`, formData);
      toast.success(`${formData.name}'s details updated successfully`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]" data-testid="edit-user-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit User Details
          </DialogTitle>
          <DialogDescription>
            Update name and email for {user?.name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Full Name *</Label>
              <Input
                id="editName"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="edit-user-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email *</Label>
              <Input
                id="editEmail"
                type="email"
                placeholder="john@bidinn.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                data-testid="edit-user-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editExtension">Tata Extension</Label>
              <Input
                id="editExtension"
                placeholder="e.g. 1001"
                value={formData.tata_extension}
                onChange={(e) => setFormData({ ...formData, tata_extension: e.target.value })}
                data-testid="edit-user-tata-extension-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="edit-user-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const { api, isManager, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const isAdmin = currentUser?.role === 'admin';
  const isManagerRole = currentUser?.role === 'manager';
  const canManageUsers = isAdmin || isManagerRole;

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      const [usersRes, leaderboardRes] = await Promise.all([
        api.get('/users'),
        api.get('/dashboard/leaderboard'),
      ]);
      setUsers(usersRes.data);
      setLeaderboard(leaderboardRes.data);
    } catch (error) {
      toast.error('Failed to fetch team data');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!isManager) return;
    try {
      await api.put(`/users/${userId}`, { role: newRole });
      toast.success('Role updated successfully');
      fetchTeamData();
    } catch (error) {
      toast.error('Failed to update role');
    }
  };

  const handleToggleStatus = async (user) => {
    if (!canManageUsers) return;
    // Managers cannot deactivate admins
    if (isManagerRole && user.role === 'admin') {
      toast.error('Managers cannot deactivate admin users');
      return;
    }
    try {
      const response = await api.post(`/users/${user.id}/toggle-status`);
      toast.success(response.data.message);
      fetchTeamData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to toggle user status');
    } finally {
      setConfirmDeactivate(null);
    }
  };

  const openResetPasswordDialog = (user) => {
    setSelectedUser(user);
    setResetPasswordDialogOpen(true);
  };

  const openEditUserDialog = (user) => {
    setSelectedUser(user);
    setEditUserDialogOpen(true);
  };

  const teamStats = {
    totalMembers: users.length,
    activeMembers: users.filter(u => u.is_active).length,
    salesReps: users.filter(u => u.role === 'sales_rep').length,
    totalRevenue: leaderboard.reduce((sum, e) => sum + e.revenue, 0),
    totalCalls: leaderboard.reduce((sum, e) => sum + e.calls_made, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="team-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground">
            Manage your team and track performance
          </p>
        </div>
        {canManageUsers && (
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="add-team-member-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold">{teamStats.totalMembers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{teamStats.activeMembers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sales Reps</p>
              <p className="text-2xl font-bold">{teamStats.salesReps}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Team Revenue</p>
              <p className="text-2xl font-bold">{formatCurrency(teamStats.totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Phone className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Calls</p>
              <p className="text-2xl font-bold">{formatNumber(teamStats.totalCalls)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Sales Leaderboard
          </CardTitle>
          <CardDescription>Top performers ranked by revenue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {leaderboard.map((entry, index) => (
              <LeaderboardCard key={entry.user_id} entry={entry} rank={index + 1} />
            ))}
            {leaderboard.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No performance data available yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Team Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>All team members and their roles</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {isManager && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`team-member-${user.id}`} className={!user.is_active ? 'opacity-60' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {generateInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {isManager ? (
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="team_lead">Team Lead</SelectItem>
                          <SelectItem value="sales_rep">Sales Rep</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className={getRoleBadgeColor(user.role)}>
                        {getRoleLabel(user.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'default' : 'destructive'} className={user.is_active ? 'bg-emerald-500' : ''}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {isManager && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`user-actions-${user.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditUserDialog(user)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          {isAdmin && user.id !== currentUser?.id && (
                            <DropdownMenuItem onClick={() => openResetPasswordDialog(user)}>
                              <KeyRound className="w-4 h-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                          )}
                          {canManageUsers && user.id !== currentUser?.id && !(isManagerRole && user.role === 'admin') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setConfirmDeactivate(user)}
                                className={user.is_active ? 'text-red-600' : 'text-emerald-600'}
                              >
                                {user.is_active ? (
                                  <>
                                    <UserX className="w-4 h-4 mr-2" />
                                    Deactivate User
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-4 h-4 mr-2" />
                                    Activate User
                                  </>
                                )}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchTeamData}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        open={resetPasswordDialogOpen}
        onOpenChange={setResetPasswordDialogOpen}
        user={selectedUser}
        onSuccess={fetchTeamData}
      />

      {/* Edit User Dialog */}
      <EditUserDialog
        open={editUserDialogOpen}
        onOpenChange={setEditUserDialogOpen}
        user={selectedUser}
        onSuccess={fetchTeamData}
      />

      {/* Confirm Deactivate Dialog */}
      <AlertDialog open={!!confirmDeactivate} onOpenChange={() => setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDeactivate?.is_active ? 'Deactivate User?' : 'Activate User?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.is_active
                ? `This will prevent ${confirmDeactivate?.name} from logging in. They will not be able to access the CRM until reactivated.`
                : `This will allow ${confirmDeactivate?.name} to log in and access the CRM again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggleStatus(confirmDeactivate)}
              className={confirmDeactivate?.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}
            >
              {confirmDeactivate?.is_active ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
