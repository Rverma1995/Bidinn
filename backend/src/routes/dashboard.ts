import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { UserRole, LeadStatus } from '../types';
import { formatDateForMySQL } from '../utils/helpers';

const router = Router();

// Get dashboard stats
router.get('/stats', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const role = user.role;

    let leadQuery = '1=1';
    let bookingQuery = '1=1';
    const leadParams: any[] = [];
    const bookingParams: any[] = [];

    if (role === UserRole.SALES_REP) {
      leadQuery = 'assigned_to = ?';
      leadParams.push(user.id);
      bookingQuery = 'created_by = ?';
      bookingParams.push(user.id);
    }

    // Count leads by status
    const [totalLeads] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE ${leadQuery}`,
      leadParams
    );
    const [newLeads] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'new' AND ${leadQuery}`,
      leadParams
    );
    const [contactedLeads] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'interested' AND ${leadQuery}`,
      leadParams
    );
    const [qualifiedLeads] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'followup' AND ${leadQuery}`,
      leadParams
    );
    const [closedWon] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'won' AND ${leadQuery}`,
      leadParams
    );
    const [closedLost] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'lost' AND ${leadQuery}`,
      leadParams
    );

    // Overdue follow-ups
    const now = formatDateForMySQL(new Date());
    const [overdueFollowups] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE next_followup < ? AND next_followup IS NOT NULL AND status NOT IN ('won', 'lost') AND ${leadQuery}`,
      [now, ...leadParams]
    );

    // Uncontacted over 1 hour
    const oneHourAgo = formatDateForMySQL(new Date(Date.now() - 60 * 60 * 1000));
    const [uncontactedOver1hr] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM leads WHERE status = 'new' AND attempt_count = 0 AND created_at < ?`,
      [oneHourAgo]
    );

    // Revenue calculations
    const [revenueResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(payment_amount), 0) as total FROM bookings WHERE ${bookingQuery}`,
      bookingParams
    );

    // Monthly revenue
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [monthlyRevenueResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(payment_amount), 0) as total FROM bookings WHERE created_at >= ? AND ${bookingQuery}`,
      [formatDateForMySQL(monthStart), ...bookingParams]
    );

    const total = (totalLeads[0] as any).count;
    const won = (closedWon[0] as any).count;
    const totalRevenue = parseFloat((revenueResult[0] as any).total) || 0;
    const conversionRate = total > 0 ? (won / total) * 100 : 0;
    const avgDealSize = won > 0 ? totalRevenue / won : 0;

    res.json({
      total_leads: total,
      new_leads: (newLeads[0] as any).count,
      contacted_leads: (contactedLeads[0] as any).count,
      qualified_leads: (qualifiedLeads[0] as any).count,
      closed_won: won,
      closed_lost: (closedLost[0] as any).count,
      overdue_followups: (overdueFollowups[0] as any).count,
      uncontacted_over_1hr: (uncontactedOver1hr[0] as any).count,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      monthly_revenue: Math.round((parseFloat((monthlyRevenueResult[0] as any).total) || 0) * 100) / 100,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      avg_deal_size: Math.round(avgDealSize * 100) / 100
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ detail: 'Failed to fetch dashboard stats' });
  }
});

// Get leaderboard
router.get('/leaderboard', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, avatar FROM users WHERE role IN ('sales_rep', 'team_lead')`
    );

    const leaderboard = [];

    for (const u of users) {
      // Get closed leads
      const [closedResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM leads WHERE assigned_to = ? AND status = 'won'`,
        [u.id]
      );

      // Get total leads
      const [totalResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM leads WHERE assigned_to = ?`,
        [u.id]
      );

      // Get revenue
      const [revenueResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(payment_amount), 0) as total FROM bookings WHERE created_by = ?`,
        [u.id]
      );

      // Get calls made
      const [callsResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM calls WHERE user_id = ?`,
        [u.id]
      );

      const leadsClosed = (closedResult[0] as any).count;
      const totalLeads = (totalResult[0] as any).count;
      const revenue = parseFloat((revenueResult[0] as any).total) || 0;
      const callsMade = (callsResult[0] as any).count;
      const conversionRate = totalLeads > 0 ? (leadsClosed / totalLeads) * 100 : 0;

      leaderboard.push({
        user_id: u.id,
        user_name: u.name,
        avatar: u.avatar,
        leads_closed: leadsClosed,
        revenue: Math.round(revenue * 100) / 100,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        calls_made: callsMade
      });
    }

    // Sort by revenue descending
    leaderboard.sort((a, b) => b.revenue - a.revenue);

    res.json(leaderboard);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ detail: 'Failed to fetch leaderboard' });
  }
});

// Get pipeline stats
router.get('/pipeline-stats', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT status, COUNT(*) as count FROM leads GROUP BY status`
    );

    const result: { [key: string]: number } = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }

    res.json(result);
  } catch (error) {
    console.error('Get pipeline stats error:', error);
    res.status(500).json({ detail: 'Failed to fetch pipeline stats' });
  }
});

// Get revenue trend
router.get('/revenue-trend', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { months = '6' } = req.query;
    const monthCount = parseInt(months as string);
    const trends = [];
    const now = new Date();

    for (let i = monthCount - 1; i >= 0; i--) {
      const monthDate = new Date(now);
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

      const [result] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(payment_amount), 0) as total FROM bookings WHERE created_at >= ? AND created_at < ?`,
        [formatDateForMySQL(monthStart), formatDateForMySQL(monthEnd)]
      );

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      trends.push({
        month: `${monthNames[monthStart.getMonth()]} ${monthStart.getFullYear()}`,
        revenue: Math.round((parseFloat((result[0] as any).total) || 0) * 100) / 100
      });
    }

    res.json(trends);
  } catch (error) {
    console.error('Get revenue trend error:', error);
    res.status(500).json({ detail: 'Failed to fetch revenue trend' });
  }
});

// Get source performance
router.get('/source-performance', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
         source,
         COUNT(*) as total,
         SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as closed_won
       FROM leads
       GROUP BY source`
    );

    const result = rows.map((row: any) => ({
      source: row.source,
      total_leads: row.total,
      closed_won: row.closed_won,
      conversion_rate: row.total > 0 ? Math.round((row.closed_won / row.total) * 10000) / 100 : 0
    }));

    res.json(result);
  } catch (error) {
    console.error('Get source performance error:', error);
    res.status(500).json({ detail: 'Failed to fetch source performance' });
  }
});

// Get agent performance reports
router.get('/agent-performance', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_id, start_date, end_date } = req.query;

    // Get all sales reps and team leads
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, email, avatar, role FROM users WHERE role IN ('sales_rep', 'team_lead') ORDER BY name`
    );

    // If specific agent requested, filter
    const agentsToProcess = agent_id 
      ? users.filter((u: any) => u.id === agent_id)
      : users;

    const agentReports = [];
    let teamTotals = {
      total_leads: 0,
      contacted: 0,
      not_contacted: 0,
      converted: 0,
      total_revenue: 0,
      calls_made: 0
    };

    // Build date filter
    let dateFilter = '';
    const dateParams: any[] = [];
    if (start_date) {
      dateFilter = ' AND created_at >= ?';
      dateParams.push(start_date);
    }
    if (end_date) {
      dateFilter += ' AND created_at <= ?';
      dateParams.push(end_date + ' 23:59:59');
    }

    for (const agent of agentsToProcess) {
      // Total leads assigned
      const [totalLeadsResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM leads WHERE assigned_to = ?${dateFilter}`,
        [agent.id, ...dateParams]
      );

      // Contacted leads (attempt_count > 0)
      const [contactedResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM leads WHERE assigned_to = ? AND attempt_count > 0${dateFilter}`,
        [agent.id, ...dateParams]
      );

      // Not contacted leads (attempt_count = 0)
      const [notContactedResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM leads WHERE assigned_to = ? AND attempt_count = 0${dateFilter}`,
        [agent.id, ...dateParams]
      );

      // Converted leads (status = 'won')
      const [convertedResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM leads WHERE assigned_to = ? AND status = 'won'${dateFilter}`,
        [agent.id, ...dateParams]
      );

      // Total revenue from bookings created by this agent
      let bookingDateFilter = '';
      if (start_date) {
        bookingDateFilter = ' AND created_at >= ?';
      }
      if (end_date) {
        bookingDateFilter += ' AND created_at <= ?';
      }
      const [revenueResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(payment_amount), 0) as total FROM bookings WHERE created_by = ?${bookingDateFilter}`,
        [agent.id, ...dateParams]
      );

      // Calls made by this agent
      let callDateFilter = '';
      if (start_date) {
        callDateFilter = ' AND created_at >= ?';
      }
      if (end_date) {
        callDateFilter += ' AND created_at <= ?';
      }
      const [callsResult] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM calls WHERE user_id = ?${callDateFilter}`,
        [agent.id, ...dateParams]
      );

      const totalLeads = (totalLeadsResult[0] as any).count;
      const contacted = (contactedResult[0] as any).count;
      const notContacted = (notContactedResult[0] as any).count;
      const converted = (convertedResult[0] as any).count;
      const revenue = parseFloat((revenueResult[0] as any).total) || 0;
      const callsMade = (callsResult[0] as any).count;
      const conversionRate = totalLeads > 0 ? (converted / totalLeads) * 100 : 0;

      agentReports.push({
        agent_id: agent.id,
        agent_name: agent.name,
        agent_email: agent.email,
        agent_avatar: agent.avatar,
        agent_role: agent.role,
        total_leads: totalLeads,
        contacted: contacted,
        not_contacted: notContacted,
        converted: converted,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        total_revenue: Math.round(revenue * 100) / 100,
        calls_made: callsMade
      });

      // Add to team totals
      teamTotals.total_leads += totalLeads;
      teamTotals.contacted += contacted;
      teamTotals.not_contacted += notContacted;
      teamTotals.converted += converted;
      teamTotals.total_revenue += revenue;
      teamTotals.calls_made += callsMade;
    }

    // Calculate team conversion rate
    const teamConversionRate = teamTotals.total_leads > 0 
      ? (teamTotals.converted / teamTotals.total_leads) * 100 
      : 0;

    res.json({
      agents: agentReports,
      team_summary: {
        ...teamTotals,
        total_revenue: Math.round(teamTotals.total_revenue * 100) / 100,
        conversion_rate: Math.round(teamConversionRate * 100) / 100,
        agent_count: agentsToProcess.length
      },
      all_agents: users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar
      }))
    });
  } catch (error) {
    console.error('Get agent performance error:', error);
    res.status(500).json({ detail: 'Failed to fetch agent performance' });
  }
});

// Get overdue follow-ups
router.get('/overdue-followups', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    
    let query = `
      SELECT l.*, u.name as assigned_name 
      FROM leads l 
      LEFT JOIN users u ON l.assigned_to = u.id 
      WHERE l.next_followup IS NOT NULL 
        AND l.next_followup < NOW() 
        AND l.status NOT IN ('won', 'lost', 'not_interested')
    `;
    const params: any[] = [];

    // Sales reps only see their own overdue leads
    if (user.role === UserRole.SALES_REP) {
      query += ' AND l.assigned_to = ?';
      params.push(user.id);
    }

    query += ' ORDER BY l.next_followup ASC LIMIT 20';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get overdue followups error:', error);
    res.status(500).json({ detail: 'Failed to fetch overdue followups' });
  }
});

export default router;
