import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { UserRole, LeadStatus } from '../types';
import { generateUUID, formatDateForMySQL, hashPassword, addActivity, createNotification } from '../utils/helpers';

const router = Router();

const TELEPHONY_ENABLED = process.env.TELEPHONY_ENABLED === 'true';

// Seed demo data
router.post('/seed-data', authMiddleware, requireRoles([UserRole.ADMIN]), async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if data already exists
    const [existingUsers] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM users');
    if ((existingUsers[0] as any).count > 1) {
      res.json({ message: 'Data already seeded' });
      return;
    }

    const usersData = [
      { name: 'Alex Thompson', email: 'alex@bidinn.com', role: 'admin', avatar: 'https://images.unsplash.com/photo-1576558656222-ba66febe3dec?crop=entropy&cs=srgb&fm=jpg&q=85&w=100' },
      { name: 'Sarah Mitchell', email: 'sarah@bidinn.com', role: 'manager', avatar: 'https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&q=85&w=100' },
      { name: 'Michael Chen', email: 'michael@bidinn.com', role: 'team_lead', avatar: 'https://images.unsplash.com/photo-1672685667592-0392f458f46f?crop=entropy&cs=srgb&fm=jpg&q=85&w=100' },
      { name: 'Emily Davis', email: 'emily@bidinn.com', role: 'sales_rep', avatar: 'https://images.pexels.com/photos/30004323/pexels-photo-30004323.jpeg?w=100' },
      { name: 'James Wilson', email: 'james@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Lisa Anderson', email: 'lisa@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Robert Taylor', email: 'robert@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Jennifer Brown', email: 'jennifer@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'David Martinez', email: 'david@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Amanda Garcia', email: 'amanda@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Christopher Lee', email: 'chris@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Michelle White', email: 'michelle@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Daniel Harris', email: 'daniel@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Jessica Clark', email: 'jessica@bidinn.com', role: 'sales_rep', avatar: null },
      { name: 'Kevin Lewis', email: 'kevin@bidinn.com', role: 'sales_rep', avatar: null }
    ];

    const userIds: string[] = [];
    const passwordHash = hashPassword('password123');
    const now = formatDateForMySQL(new Date());

    for (const u of usersData) {
      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM users WHERE email = ?',
        [u.email]
      );

      if (existing.length > 0) {
        userIds.push((existing[0] as any).id);
        continue;
      }

      const id = generateUUID();
      await pool.execute(
        'INSERT INTO users (id, email, name, role, avatar, is_active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)',
        [id, u.email, u.name, u.role, u.avatar, passwordHash, now]
      );
      userIds.push(id);
    }

    // Create leads
    const sources = ['Website', 'Referral', 'Google Ads', 'Facebook', 'LinkedIn', 'Cold Call', 'Trade Show', 'Partner'];
    const campaigns = ['Summer Sale 2024', 'Holiday Special', 'New Year Promo', 'Spring Campaign', 'Partner Referral'];
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];
    const statuses = ['new', 'interested', 'not_interested', 'followup', 'won', 'lost'];

    const leadNames = [
      'Acme Corporation', 'TechStart Inc', 'Global Solutions', 'Prime Industries', 'Vista Holdings',
      'Summit Partners', 'Nexus Group', 'Atlas Enterprises', 'Pinnacle Systems', 'Vanguard LLC',
      'Horizon Tech', 'Apex Dynamics', 'Sterling Corp', 'Quantum Labs', 'Phoenix Digital',
      'Evergreen Solutions', 'Titan Industries', 'Nova Ventures', 'Blue Ocean Inc', 'Red Rock Partners',
      'Silver Creek LLC', 'Golden Gate Corp', 'Pacific Edge', 'Mountain View Tech', 'Valley Stream Inc',
      'Coastal Enterprises', 'Metro Systems', 'Urban Solutions', 'Suburban Group', 'Rural Partners',
      'Northern Lights Co', 'Southern Cross LLC', 'Eastern Alliance', 'Western Frontier', 'Central Hub Inc',
      'Alpha Analytics', 'Beta Solutions', 'Gamma Tech', 'Delta Corp', 'Epsilon Partners',
      'Zeta Innovations', 'Theta Systems', 'Iota Group', 'Kappa Ventures', 'Lambda Labs',
      'Omega Industries', 'Sigma Solutions', 'Tau Tech', 'Upsilon Corp', 'Chi Enterprises'
    ];

    const leadsCreated: any[] = [];

    for (let i = 0; i < leadNames.length; i++) {
      const name = leadNames[i];
      const status = statuses[i % statuses.length];
      const assignedTo = i % 3 !== 0 ? userIds[3 + (i % 12)] : null;
      const assignedName = assignedTo ? usersData.find((u, idx) => userIds[idx] === assignedTo)?.name : null;

      const daysAgo = i % 60;
      const hoursAgo = (i * 7) % 24;
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);

      const id = generateUUID();
      const lead = {
        id,
        name,
        phone: `+1-555-${(100 + i).toString().padStart(3, '0')}-${(1000 + i).toString().padStart(4, '0')}`,
        email: `contact@${name.toLowerCase().replace(/ /g, '')}.com`,
        source: sources[i % sources.length],
        campaign: i % 2 === 0 ? campaigns[i % campaigns.length] : null,
        city: cities[i % cities.length],
        status,
        assigned_to: assignedTo,
        assigned_name: assignedName,
        attempt_count: status === 'new' ? 0 : (i % 5) + 1,
        last_activity: status !== 'new' ? formatDateForMySQL(createdAt) : null,
        next_followup: !['new', 'won', 'lost'].includes(status) ? formatDateForMySQL(new Date(Date.now() + (i % 7) * 24 * 60 * 60 * 1000)) : null,
        notes: `Interested in premium package. Budget: ₹${(i + 1) * 50000}`,
        created_at: formatDateForMySQL(createdAt),
        updated_at: formatDateForMySQL(createdAt)
      };

      await pool.execute(
        `INSERT INTO leads (id, name, phone, email, source, campaign, city, status, assigned_to, assigned_name, attempt_count, last_activity, next_followup, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [lead.id, lead.name, lead.phone, lead.email, lead.source, lead.campaign, lead.city, lead.status, lead.assigned_to, lead.assigned_name, lead.attempt_count, lead.last_activity, lead.next_followup, lead.notes, lead.created_at, lead.updated_at]
      );

      leadsCreated.push(lead);
    }

    // Create bookings for won leads
    const closedLeads = leadsCreated.filter(l => l.status === 'won');
    const hotels = ['Grand Hotel', 'The Ritz', 'Marriott', 'Hilton', 'Hyatt', 'Four Seasons', 'W Hotel', 'Sheraton'];

    for (let i = 0; i < closedLeads.length; i++) {
      const lead = closedLeads[i];
      const id = generateUUID();
      const finalPrice = 50000 + (i * 5000);
      const paymentStatus = i % 3 === 0 ? 'paid' : (i % 3 === 1 ? 'partial' : 'unpaid');
      const paymentAmount = paymentStatus === 'paid' ? finalPrice : (paymentStatus === 'partial' ? Math.floor(finalPrice / 2) : 0);

      await pool.execute(
        `INSERT INTO bookings (id, lead_id, lead_name, hotel_name, check_in, check_out, final_price, bid_price, payment_status, payment_amount, notes, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          lead.id,
          lead.name,
          hotels[i % hotels.length],
          formatDateForMySQL(new Date(Date.now() + (10 + i) * 24 * 60 * 60 * 1000)).slice(0, 10),
          formatDateForMySQL(new Date(Date.now() + (13 + i) * 24 * 60 * 60 * 1000)).slice(0, 10),
          finalPrice,
          Math.floor(finalPrice * 0.9),
          paymentStatus,
          paymentAmount,
          'VIP booking',
          lead.created_at,
          lead.assigned_to || userIds[3]
        ]
      );
    }

    // Create call logs
    const outcomes = ['connected', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'callback_requested'];
    for (let i = 0; i < Math.min(30, leadsCreated.length); i++) {
      const lead = leadsCreated[i];
      if (lead.attempt_count > 0) {
        for (let j = 0; j < lead.attempt_count; j++) {
          const id = generateUUID();
          const createdAt = new Date(new Date(lead.created_at).getTime() + j * 24 * 60 * 60 * 1000);

          await pool.execute(
            `INSERT INTO calls (id, lead_id, user_id, user_name, outcome, duration_minutes, notes, next_followup, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              lead.id,
              lead.assigned_to || userIds[3],
              lead.assigned_name || 'Emily Davis',
              outcomes[j % outcomes.length],
              5 + (j * 3),
              `Follow-up call #${j + 1}`,
              lead.next_followup,
              formatDateForMySQL(createdAt)
            ]
          );
        }
      }
    }

    res.json({ message: `Seeded ${usersData.length} users, ${leadsCreated.length} leads, and related data` });
  } catch (error) {
    console.error('Seed data error:', error);
    res.status(500).json({ detail: 'Failed to seed data' });
  }
});

// Run auto-reset job
router.post('/run-auto-reset', authMiddleware, requireRoles([UserRole.ADMIN]), async (req: Request, res: Response): Promise<void> => {
  try {
    const thirtyDaysAgo = formatDateForMySQL(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const [leadsToReset] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM leads WHERE status NOT IN ('new', 'won', 'lost') AND last_activity < ?`,
      [thirtyDaysAgo]
    );

    let resetCount = 0;
    const now = formatDateForMySQL(new Date());

    for (const lead of leadsToReset) {
      // Check for recent activity
      const [recentActivity] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM activities WHERE lead_id = ? AND created_at >= ?`,
        [lead.id, thirtyDaysAgo]
      );

      if (recentActivity.length === 0) {
        await pool.execute(
          `UPDATE leads SET status = 'new', assigned_to = NULL, assigned_name = NULL, updated_at = ? WHERE id = ?`,
          [now, lead.id]
        );

        await addActivity(lead.id, 'Auto-reset', 'Lead reset due to 30 days of inactivity', undefined, 'System');

        // Notify managers
        const [managers] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM users WHERE role IN ('admin', 'manager')`
        );

        for (const manager of managers) {
          await createNotification(
            manager.id,
            'Lead Auto-Reset',
            `Lead '${lead.name}' has been reset due to inactivity`,
            'auto_reset',
            lead.id
          );
        }

        resetCount++;
      }
    }

    res.json({ message: `Auto-reset completed. ${resetCount} leads reset.` });
  } catch (error) {
    console.error('Auto-reset error:', error);
    res.status(500).json({ detail: 'Failed to run auto-reset' });
  }
});

// Get feature flags
router.get('/features', async (req: Request, res: Response): Promise<void> => {
  res.json({
    telephony_enabled: TELEPHONY_ENABLED
  });
});

export default router;
