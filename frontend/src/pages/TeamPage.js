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
          {entry.conversion_rate.toFixed(1)}% conv.
        </p>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { api, isManager } = useAuth();
  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const teamStats = {
    totalMembers: users.length,
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground">
          Manage your team and track performance
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
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
                {isManager && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`team-member-${user.id}`}>
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
                    <Badge variant="secondary" className={getRoleBadgeColor(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'default' : 'outline'} className={user.is_active ? 'bg-emerald-500' : ''}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {isManager && (
                    <TableCell>
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
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
