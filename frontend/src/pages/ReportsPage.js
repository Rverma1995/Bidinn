import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
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
  DollarSign,
  Users,
  Target,
  BarChart3,
  Phone,
  UserCheck,
  UserX,
  IndianRupee,
} from 'lucide-react';

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

export default function ReportsPage() {
  const { api } = useAuth();
  const [stats, setStats] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [pipelineStats, setPipelineStats] = useState({});
  const [sourceData, setSourceData] = useState([]);
  const [agentPerformance, setAgentPerformance] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [loading, setLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);

  useEffect(() => {
    fetchReportData();
  }, []);

  useEffect(() => {
    fetchAgentPerformance();
  }, [selectedAgent]);

  const fetchReportData = async () => {
    try {
      const [statsRes, revenueRes, pipelineRes, sourceRes, agentRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/revenue-trend'),
        api.get('/dashboard/pipeline-stats'),
        api.get('/dashboard/source-performance'),
        api.get('/dashboard/agent-performance'),
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
    if (!selectedAgent) return;
    setAgentLoading(true);
    try {
      const url = selectedAgent === 'all' 
        ? '/dashboard/agent-performance'
        : `/dashboard/agent-performance?agent_id=${selectedAgent}`;
      const res = await api.get(url);
      setAgentPerformance(res.data);
    } catch (error) {
      console.error('Failed to fetch agent performance:', error);
    } finally {
      setAgentLoading(false);
    }
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
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Analytics and performance metrics
        </p>
      </div>

      {/* Agent Performance Section */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Agent Performance Report
              </CardTitle>
              <CardDescription>Performance metrics by sales representative</CardDescription>
            </div>
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

              {/* Agent Details Table */}
              {selectedAgent === 'all' && agentPerformance?.agents?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="agent-performance-table">
                    <thead>
                      <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
                        <th className="text-left p-3 font-medium">Agent</th>
                        <th className="text-right p-3 font-medium">Leads Assigned</th>
                        <th className="text-right p-3 font-medium">Contacted</th>
                        <th className="text-right p-3 font-medium">Not Contacted</th>
                        <th className="text-right p-3 font-medium">Converted</th>
                        <th className="text-right p-3 font-medium">Conversion Rate</th>
                        <th className="text-right p-3 font-medium">Revenue (₹)</th>
                        <th className="text-right p-3 font-medium">Calls Made</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentPerformance.agents.map((agent) => (
                        <tr key={agent.agent_id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={agent.agent_avatar} />
                                <AvatarFallback className="text-xs bg-primary/10">
                                  {agent.agent_name?.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{agent.agent_name}</p>
                                <p className="text-xs text-muted-foreground">{agent.agent_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right font-medium">{agent.total_leads}</td>
                          <td className="p-3 text-right">
                            <span className="text-emerald-600">{agent.contacted}</span>
                          </td>
                          <td className="p-3 text-right">
                            <span className="text-amber-600">{agent.not_contacted}</span>
                          </td>
                          <td className="p-3 text-right">
                            <span className="text-purple-600 font-medium">{agent.converted}</span>
                          </td>
                          <td className="p-3 text-right">
                            <Badge variant={agent.conversion_rate > 20 ? 'default' : agent.conversion_rate > 10 ? 'secondary' : 'outline'}>
                              {agent.conversion_rate}%
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-semibold text-green-600">
                            {formatINR(agent.total_revenue)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              {agent.calls_made}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Single Agent View */}
              {selectedAgent !== 'all' && agentPerformance?.agents?.length > 0 && (
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
