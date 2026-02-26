import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { Skeleton } from '../components/ui/skeleton';
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
  generateInitials,
  getCountdownTime,
} from '../lib/utils';
import {
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Phone,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Trophy,
  Target,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#4F46E5', '#06B6D4', '#8B5CF6', '#F59E0B', '#F97316', '#10B981', '#EF4444'];

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down';
  trendValue?: string;
  className?: string;
  loading?: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue, className, loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`stat-card card-hover ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-3 text-sm ${
            trend === 'up' ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="font-medium">{trendValue}</span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LeadCardProps {
  lead: any;
}

function LeadCard({ lead }: LeadCardProps) {
  const countdown = getCountdownTime(lead.created_at);
  const showCountdown = lead.status === 'new' && lead.attempt_count === 0;

  return (
    <div className={`p-4 rounded-lg border bg-white dark:bg-slate-900 card-hover ${
      lead.is_overdue ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-800'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{lead.name}</p>
          <p className="text-sm text-muted-foreground">{lead.phone}</p>
        </div>
        {showCountdown && countdown && (
          <Badge className={`flex-shrink-0 ${
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
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Badge variant="secondary" className={getStatusColor(lead.status)}>
          {getStatusLabel(lead.status)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {lead.source}
        </span>
      </div>
    </div>
  );
}

function LeaderboardCard({ entry, rank }) {
  const getRankClass = () => {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return 'bg-slate-100 dark:bg-slate-800';
  };

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getRankClass()}`}>
        {rank}
      </div>
      <Avatar className="w-10 h-10">
        <AvatarImage src={entry.avatar} alt={entry.user_name} />
        <AvatarFallback>{generateInitials(entry.user_name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{entry.user_name}</p>
        <p className="text-sm text-muted-foreground">
          {entry.leads_closed} closed · {entry.calls_made} calls
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(entry.revenue)}
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.conversion_rate.toFixed(1)}% conv.
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, api, isManager } = useAuth();
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [pipelineStats, setPipelineStats] = useState({});
  const [sourceData, setSourceData] = useState([]);
  const [uncontactedLeads, setUncontactedLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, leaderboardRes, revenueRes, pipelineRes, sourceRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/leaderboard'),
        api.get('/dashboard/revenue-trend'),
        api.get('/dashboard/pipeline-stats'),
        api.get('/dashboard/source-performance'),
      ]);

      setStats(statsRes.data);
      setLeaderboard(leaderboardRes.data);
      setRevenueData(revenueRes.data);
      setPipelineStats(pipelineRes.data);
      setSourceData(sourceRes.data);

      // Fetch uncontacted leads for managers
      if (isManager) {
        try {
          const uncontactedRes = await api.get('/leads/uncontacted');
          setUncontactedLeads(uncontactedRes.data.slice(0, 5));
        } catch (e) {
          console.log('Uncontacted leads fetch skipped');
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const pipelineChartData = Object.entries(pipelineStats).map(([status, count]) => ({
    name: getStatusLabel(status),
    value: count,
    status,
  }));

  return (
    <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.name?.split(' ')[0]}
          </p>
        </div>
        <Button asChild>
          <Link to="/leads">
            View all leads
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Leads"
          value={formatNumber(stats?.total_leads || 0)}
          subtitle={`${stats?.new_leads || 0} new this month`}
          icon={Users}
          loading={loading}
        />
        <StatCard
          title="Closed Won"
          value={formatNumber(stats?.closed_won || 0)}
          subtitle={`${stats?.conversion_rate?.toFixed(1) || 0}% conversion`}
          icon={CheckCircle2}
          trend="up"
          trendValue="+12%"
          loading={loading}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats?.total_revenue || 0)}
          subtitle={`${formatCurrency(stats?.avg_deal_size || 0)} avg deal`}
          icon={DollarSign}
          trend="up"
          trendValue="+8%"
          loading={loading}
        />
        <StatCard
          title="This Month"
          value={formatCurrency(stats?.monthly_revenue || 0)}
          subtitle="Revenue collected"
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      {/* Alert Cards for Managers */}
      {isManager && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={`border-l-4 ${(stats?.uncontacted_over_1hr || 0) > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-full ${(stats?.uncontacted_over_1hr || 0) > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                <AlertTriangle className={`w-5 h-5 ${(stats?.uncontacted_over_1hr || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
              </div>
              <div>
                <p className="font-medium">Uncontacted Leads ({'>'}1hr)</p>
                <p className="text-2xl font-bold">{stats?.uncontacted_over_1hr || 0}</p>
              </div>
              {(stats?.uncontacted_over_1hr || 0) > 0 && (
                <Button variant="outline" size="sm" className="ml-auto" asChild>
                  <Link to="/leads?filter=uncontacted">Review</Link>
                </Button>
              )}
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${(stats?.overdue_followups || 0) > 0 ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-full ${(stats?.overdue_followups || 0) > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                <Clock className={`w-5 h-5 ${(stats?.overdue_followups || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
              </div>
              <div>
                <p className="font-medium">Overdue Follow-ups</p>
                <p className="text-2xl font-bold">{stats?.overdue_followups || 0}</p>
              </div>
              {(stats?.overdue_followups || 0) > 0 && (
                <Button variant="outline" size="sm" className="ml-auto" asChild>
                  <Link to="/leads?filter=overdue">Review</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Trend</CardTitle>
            <CardDescription>Last 6 months performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => `$${value / 1000}k`}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Distribution</CardTitle>
            <CardDescription>Leads by stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pipelineChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pipelineChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {pipelineChartData.slice(0, 6).map((item: any, index: number) => (
                <div key={item.status} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Sales Leaderboard
              </CardTitle>
              <CardDescription>Top performers this month</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/team">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))
              ) : (
                leaderboard.slice(0, 5).map((entry, index) => (
                  <LeaderboardCard key={entry.user_id} entry={entry} rank={index + 1} />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Source Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Source Performance
            </CardTitle>
            <CardDescription>Conversion by lead source</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))
              ) : (
                sourceData.slice(0, 5).map((source) => (
                  <div key={source.source}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{source.source}</span>
                      <span className="text-muted-foreground">
                        {source.closed_won}/{source.total_leads} ({source.conversion_rate}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${source.conversion_rate}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Uncontacted Leads Alert for Managers */}
      {isManager && uncontactedLeads.length > 0 && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Urgent: Leads Uncontacted for Over 1 Hour
            </CardTitle>
            <CardDescription className="text-red-600/70 dark:text-red-400/70">
              These leads require immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {uncontactedLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
            <Button className="mt-4" variant="destructive" asChild>
              <Link to="/leads?filter=uncontacted">
                View all uncontacted leads
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
