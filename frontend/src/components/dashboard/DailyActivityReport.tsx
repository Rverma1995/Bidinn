import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Skeleton } from '../ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { formatCallDuration, formatNumber, getStatusLabel } from '../../lib/utils';
import type { DailyActivityRange, DailyActivityReport } from '../../types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Clock, Phone, Users, ArrowUpDown } from 'lucide-react';

const COLORS = ['#4F46E5', '#06B6D4', '#8B5CF6', '#F59E0B', '#F97316', '#10B981', '#EF4444'];

const RANGE_OPTIONS: { value: DailyActivityRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];

type SortDirection = 'asc' | 'desc';

export default function DailyActivityReport() {
  const { api, isAdmin } = useAuth();
  const [range, setRange] = useState<DailyActivityRange>('today');
  const [report, setReport] = useState<DailyActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [callSortDir, setCallSortDir] = useState<SortDirection>('desc');
  const [timeSortDir, setTimeSortDir] = useState<SortDirection>('desc');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/daily?range=${range}`);
      setReport(res.data);
    } catch (error) {
      console.error('Failed to fetch daily activity report:', error);
    } finally {
      setLoading(false);
    }
  }, [api, range]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const scopeLabel = isAdmin ? 'All agents' : 'Your activity only';

  const stageChartData = (report?.leads_contacted.by_stage || [])
    .filter((row) => row.count > 0)
    .map((row, index) => ({
      name: getStatusLabel(row.status),
      count: row.count,
      fill: COLORS[index % COLORS.length],
    }));

  const sortedCalls = [...(report?.calls_by_agent || [])].sort((a, b) =>
    callSortDir === 'desc' ? b.call_count - a.call_count : a.call_count - b.call_count
  );

  const sortedCallTime = [...(report?.call_time_by_agent || [])].sort((a, b) =>
    timeSortDir === 'desc'
      ? b.total_duration_minutes - a.total_duration_minutes
      : a.total_duration_minutes - b.total_duration_minutes
  );

  return (
    <section className="space-y-4" data-testid="daily-activity-report">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Daily Activity Report
          </h2>
          <p className="text-sm text-muted-foreground">
            {scopeLabel}
            {report?.range_label ? ` · ${report.range_label}` : ''}
          </p>
        </div>
        <Tabs
          value={range}
          onValueChange={(value) => setRange(value as DailyActivityRange)}
        >
          <TabsList>
            {RANGE_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Total Leads Generated
            </CardTitle>
            <CardDescription>New leads created in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-24" />
            ) : (
              <p className="text-3xl font-bold tabular-nums">
                {formatNumber(report?.total_leads_generated ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              Leads Contacted
            </CardTitle>
            <CardDescription>
              Call logged or moved out of New status in period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-24" />
            ) : (
              <p className="text-3xl font-bold tabular-nums">
                {formatNumber(report?.leads_contacted.total ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacted Leads by Stage</CardTitle>
          <CardDescription>Current pipeline stage for leads contacted in period</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : stageChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No contacted leads in this period
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [value, 'Leads']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" radius={4}>
                    {stageChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calls Made by Agent</CardTitle>
            <CardDescription>Call log entries in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array(4).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sortedCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No calls logged in this period
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => setCallSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Calls
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCalls.map((row) => (
                    <TableRow key={row.agent_id}>
                      <TableCell className="font-medium">{row.agent_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.call_count)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card data-testid="call-time-per-agent">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Call Time per Agent
            </CardTitle>
            <CardDescription>
              Total logged call duration in the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array(4).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sortedCallTime.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No call duration logged in this period
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => setTimeSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Duration
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCallTime.map((row) => (
                    <TableRow key={row.agent_id}>
                      <TableCell className="font-medium">{row.agent_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCallDuration(row.total_duration_minutes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
