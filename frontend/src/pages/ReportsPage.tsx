import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import {
  formatCurrency,
  formatNumber,
  getStatusLabel,
} from '../lib/utils';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts';
import {
  TrendingUp,
  Users,
  Target,
  BarChart3,
  Phone,
  UserCheck,
  UserX,
  IndianRupee,
  CalendarIcon,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

const COLORS = ['#4F46E5', '#06B6D4', '#8B5CF6', '#F59E0B', '#F97316', '#10B981', '#EF4444'];

// Format currency in INR
const formatINR = (value) => {
  const num = parseFloat(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

// Date range presets
const DATE_PRESETS = [
  { label: 'All Time', value: 'all' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Quarter', value: 'quarter' },
  { label: 'Custom', value: 'custom' },
];

interface PipelineStats {
  new?: number;
  interested?: number;
  followup?: number;
  won?: number;
  lost?: number;
  not_interested?: number;
  [key: string]: number | undefined;
}

export default function ReportsPage() {
  const { api, user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [pipelineStats, setPipelineStats] = useState<PipelineStats>({});
  const [sourceData, setSourceData] = useState<any[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<any>(null);
  const [datePreset, setDatePreset] = useState('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);
  
  // Sales reps can only see their own data
  const isSalesRep = user?.role === 'sales_rep';
  const isTeamLead = user?.role === 'team_lead';
  const canViewAllAgents = !isSalesRep; // Admin, Manager, Team Lead can see all
  const [selectedAgent, setSelectedAgent] = useState(isSalesRep ? user?.id || 'all' : 'all');

  useEffect(() => {
    fetchReportData();
  }, []);

  useEffect(() => {
    fetchAgentPerformance();
  }, [selectedAgent, startDate, endDate]);

  useEffect(() => {
    // Apply date preset
    const now = new Date();
    switch (datePreset) {
      case '7d':
        setStartDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        setEndDate(now);
        break;
      case '30d':
        setStartDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        setEndDate(now);
        break;
      case 'month':
        setStartDate(new Date(now.getFullYear(), now.getMonth(), 1));
        setEndDate(now);
        break;
      case 'quarter':
        setStartDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
        setEndDate(now);
        break;
      case 'all':
        setStartDate(null);
        setEndDate(null);
        break;
      // 'custom' - don't change dates
    }
  }, [datePreset]);

  const fetchReportData = async () => {
    try {
      // For sales reps, we need to filter agent performance to their own data
      const agentParam = isSalesRep && user?.id ? `?agent_id=${user.id}` : '';
      
      const [statsRes, revenueRes, pipelineRes, sourceRes, agentRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/revenue-trend'),
        api.get('/dashboard/pipeline-stats'),
        api.get('/dashboard/source-performance'),
        api.get(`/dashboard/agent-performance${agentParam}`),
      ]);

      setStats(statsRes.data);
      setRevenueData(revenueRes.data);
      setPipelineStats(pipelineRes.data);
      setSourceData(sourceRes.data);
      setAgentPerformance(agentRes.data);
    } catch (error) {
      console.error('Failed to fetch report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentPerformance = async () => {
    setAgentLoading(true);
    try {
      const params = new URLSearchParams();
      // Sales reps can only see their own data
      const effectiveAgent = isSalesRep && user?.id ? user.id : selectedAgent;
      if (effectiveAgent !== 'all') params.append('agent_id', effectiveAgent);
      if (startDate) params.append('start_date', format(startDate, 'yyyy-MM-dd'));
      if (endDate) params.append('end_date', format(endDate, 'yyyy-MM-dd'));
      
      const url = `/dashboard/agent-performance${params.toString() ? '?' + params.toString() : ''}`;
      const res = await api.get(url);
      setAgentPerformance(res.data);
    } catch (error) {
      console.error('Failed to fetch agent performance:', error);
    } finally {
      setAgentLoading(false);
    }
  };

  const clearDateFilter = () => {
    setDatePreset('all');
    setStartDate(null);
    setEndDate(null);
  };

  const funnelData = [
    { name: 'New', value: pipelineStats.new || 0, fill: '#4F46E5' },
    { name: 'Interested', value: pipelineStats.interested || 0, fill: '#06B6D4' },
    { name: 'Follow-up', value: pipelineStats.followup || 0, fill: '#8B5CF6' },
    { name: 'Won', value: pipelineStats.won || 0, fill: '#10B981' },
  ];

  const sourceChartData = sourceData.map(s => ({
    name: s.source,
    leads: s.total_leads,
    won: s.closed_won,
    rate: s.conversion_rate,
  }));

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in" data-testid="reports-page">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Analytics and performance metrics</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="reports-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSalesRep ? 'My Reports' : 'Reports'}
        </h1>
        <p className="text-muted-foreground">
          {isSalesRep ? 'Your personal analytics and performance' : 'Analytics and performance metrics'}
        </p>
      </div>

      {/* Agent Performance Section */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  {isSalesRep ? 'My Performance Report' : 'Agent Performance Report'}
                </CardTitle>
                <CardDescription>
                  {isSalesRep ? 'Your personal performance metrics' : 'Performance metrics by sales representative'}
                </CardDescription>
              </div>
              {/* Agent selector - hidden for sales reps */}
              {canViewAllAgents && (
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-[240px]" data-testid="agent-filter-dropdown">
                    <SelectValue placeholder="Select Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents (Team View)</SelectItem>
                    {agentPerformance?.all_agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <Label className="text-sm font-medium">Date Range:</Label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="w-[140px]" data-testid="date-preset-dropdown">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {(datePreset === 'custom' || startDate || endDate) && (
                <>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-[130px]" data-testid="start-date-picker">
                          <CalendarIcon className="w-4 h-4 mr-2" />
                          {startDate ? format(startDate, 'MMM dd, yyyy') : 'Start'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => {
                            setStartDate(date);
                            setDatePreset('custom');
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground">to</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-[130px]" data-testid="end-date-picker">
                          <CalendarIcon className="w-4 h-4 mr-2" />
                          {endDate ? format(endDate, 'MMM dd, yyyy') : 'End'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => {
                            setEndDate(date);
                            setDatePreset('custom');
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {agentLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <>
              {/* Team Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-blue-600 font-medium">Total Leads</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" data-testid="total-leads-assigned">
                      {agentPerformance?.team_summary?.total_leads || 0}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs text-emerald-600 font-medium">Contacted</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="contacted-count">
                      {agentPerformance?.team_summary?.contacted || 0}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <UserX className="w-4 h-4 text-amber-600" />
                      <span className="text-xs text-amber-600 font-medium">Not Contacted</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300" data-testid="not-contacted-count">
                      {agentPerformance?.team_summary?.not_contacted || 0}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="w-4 h-4 text-purple-600" />
                      <span className="text-xs text-purple-600 font-medium">Converted</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300" data-testid="converted-count">
                      {agentPerformance?.team_summary?.converted || 0}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <IndianRupee className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-green-600 font-medium">Total Revenue</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300" data-testid="total-revenue-inr">
                      {formatINR(agentPerformance?.team_summary?.total_revenue || 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Agent Details Table - Only shown for admin/manager/team lead when viewing all agents */}
              {selectedAgent === 'all' && canViewAllAgents && agentPerformance?.agents?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="agent-performance-table">
                    <thead>
                      <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
                        <th className="text-left p-3 font-medium sticky left-0 bg-slate-50 dark:bg-slate-800/50">Agent</th>
                        <th className="text-right p-2 font-medium text-xs">Total</th>
                        <th className="text-right p-2 font-medium text-xs text-blue-600">New</th>
                        <th className="text-right p-2 font-medium text-xs text-slate-500">Not Answered</th>
                        <th className="text-right p-2 font-medium text-xs text-cyan-600">Interested</th>
                        <th className="text-right p-2 font-medium text-xs text-amber-600">Follow-up</th>
                        <th className="text-right p-2 font-medium text-xs text-green-600">Won</th>
                        <th className="text-right p-2 font-medium text-xs text-red-600">Lost</th>
                        <th className="text-right p-2 font-medium text-xs text-gray-500">Not Interested</th>
                        <th className="text-right p-2 font-medium text-xs">Conv %</th>
                        <th className="text-right p-2 font-medium text-xs">Revenue</th>
                        <th className="text-right p-2 font-medium text-xs">Calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentPerformance.agents.map((agent) => (
                        <tr 
                          key={agent.agent_id} 
                          className={`border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                            agent.agent_role === 'system' ? 'bg-slate-100 dark:bg-slate-800/80 font-medium' : ''
                          }`}
                        >
                          <td className="p-3 sticky left-0 bg-white dark:bg-slate-900">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                {agent.agent_role === 'system' ? (
                                  <AvatarFallback className="text-xs bg-slate-300 dark:bg-slate-600">
                                    SYS
                                  </AvatarFallback>
                                ) : (
                                  <>
                                    <AvatarImage src={agent.agent_avatar} />
                                    <AvatarFallback className="text-xs bg-primary/10">
                                      {agent.agent_name?.split(' ').map(n => n[0]).join('')}
                                    </AvatarFallback>
                                  </>
                                )}
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm truncate max-w-[120px]">{agent.agent_name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 text-right font-semibold">{agent.total_leads}</td>
                          <td className="p-2 text-right text-blue-600">{agent.stage_new || 0}</td>
                          <td className="p-2 text-right text-slate-500">{agent.stage_not_answered || 0}</td>
                          <td className="p-2 text-right text-cyan-600">{agent.stage_interested || 0}</td>
                          <td className="p-2 text-right text-amber-600">{agent.stage_followup || 0}</td>
                          <td className="p-2 text-right text-green-600 font-medium">{agent.stage_won || 0}</td>
                          <td className="p-2 text-right text-red-600">{agent.stage_lost || 0}</td>
                          <td className="p-2 text-right text-gray-500">{agent.stage_not_interested || 0}</td>
                          <td className="p-2 text-right">
                            <Badge variant={agent.conversion_rate > 20 ? 'default' : agent.conversion_rate > 10 ? 'secondary' : 'outline'} className="text-xs">
                              {agent.conversion_rate}%
                            </Badge>
                          </td>
                          <td className="p-2 text-right font-semibold text-green-600 text-sm">
                            {formatINR(agent.total_revenue)}
                          </td>
                          <td className="p-2 text-right text-sm">
                            {agent.agent_role === 'system' ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <Phone className="w-3 h-3 text-muted-foreground" />
                                {agent.calls_made}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Single Agent View - shows for specific agent selection or for sales reps viewing their own data */}
              {(selectedAgent !== 'all' || isSalesRep) && agentPerformance?.agents?.length > 0 && (
                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={agentPerformance.agents[0]?.agent_avatar} />
                      <AvatarFallback className="text-lg bg-primary/10">
                        {agentPerformance.agents[0]?.agent_name?.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-semibold">{agentPerformance.agents[0]?.agent_name}</h3>
                      <p className="text-muted-foreground">{agentPerformance.agents[0]?.agent_email}</p>
                      <Badge variant="outline" className="mt-1">{agentPerformance.agents[0]?.agent_role?.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                      <p className="text-2xl font-bold">{agentPerformance.agents[0]?.total_leads}</p>
                      <p className="text-xs text-muted-foreground">Total Leads</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                      <p className="text-2xl font-bold text-emerald-600">{agentPerformance.agents[0]?.contacted}</p>
                      <p className="text-xs text-muted-foreground">Contacted</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600">{agentPerformance.agents[0]?.not_contacted}</p>
                      <p className="text-xs text-muted-foreground">Not Contacted</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600">{agentPerformance.agents[0]?.converted}</p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                      <p className="text-2xl font-bold">{agentPerformance.agents[0]?.conversion_rate}%</p>
                      <p className="text-xs text-muted-foreground">Conversion Rate</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{formatINR(agentPerformance.agents[0]?.total_revenue)}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatINR(stats?.total_revenue || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <IndianRupee className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm text-emerald-600">
              <TrendingUp className="w-4 h-4" />
              <span>+12.5% vs last month</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{formatNumber(stats?.total_leads || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm text-blue-600">
              <TrendingUp className="w-4 h-4" />
              <span>{stats?.new_leads || 0} new this month</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{stats?.conversion_rate?.toFixed(1) || 0}%</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm text-purple-600">
              <span>{stats?.closed_won || 0} deals closed</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Deal Size</p>
                <p className="text-2xl font-bold">{formatINR(stats?.avg_deal_size || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <BarChart3 className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Monthly revenue over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
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
                    tickFormatter={(value) => `₹${value / 1000}k`}
                  />
                  <Tooltip
                    formatter={(value) => [formatINR(value), 'Revenue']}
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
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Funnel</CardTitle>
            <CardDescription>Lead progression through stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Funnel
                    dataKey="value"
                    data={funnelData}
                    isAnimationActive
                  >
                    <LabelList position="right" fill="#000" stroke="none" dataKey="name" />
                    <LabelList position="center" fill="#fff" stroke="none" dataKey="value" />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Source Performance</CardTitle>
            <CardDescription>Leads and conversions by source</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="leads" name="Total Leads" fill="hsl(var(--primary))" radius={4} />
                  <Bar dataKey="won" name="Closed Won" fill="#10B981" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Distribution</CardTitle>
            <CardDescription>Current leads by stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(pipelineStats).map(([status, count], index) => ({
                      name: getStatusLabel(status),
                      value: count,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {Object.keys(pipelineStats).map((_, index) => (
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
            <div className="grid grid-cols-2 gap-2 mt-4">
              {Object.entries(pipelineStats).slice(0, 6).map(([status, count], index) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate">{getStatusLabel(status)}</span>
                  <span className="font-medium ml-auto">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source Conversion Table */}
      <Card>
        <CardHeader>
          <CardTitle>Source ROI Analysis</CardTitle>
          <CardDescription>Detailed conversion metrics by lead source</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-right p-3 font-medium">Total Leads</th>
                  <th className="text-right p-3 font-medium">Closed Won</th>
                  <th className="text-right p-3 font-medium">Conversion Rate</th>
                  <th className="text-right p-3 font-medium">Performance</th>
                </tr>
              </thead>
              <tbody>
                {sourceData.map((source) => (
                  <tr key={source.source} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium">{source.source}</td>
                    <td className="p-3 text-right">{source.total_leads}</td>
                    <td className="p-3 text-right">{source.closed_won}</td>
                    <td className="p-3 text-right">{source.conversion_rate}%</td>
                    <td className="p-3 text-right">
                      <Badge variant={source.conversion_rate > 20 ? 'default' : source.conversion_rate > 10 ? 'secondary' : 'outline'}>
                        {source.conversion_rate > 20 ? 'High' : source.conversion_rate > 10 ? 'Medium' : 'Low'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
