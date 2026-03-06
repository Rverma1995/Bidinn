import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import pool, { initDatabase } from './config/database';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import leadRoutes from './routes/leads';
import callRoutes from './routes/calls';
import bookingRoutes from './routes/bookings';
import paymentRoutes from './routes/payments';
import dashboardRoutes from './routes/dashboard';
import activityRoutes from './routes/activities';
import notificationRoutes from './routes/notifications';
import adminRoutes from './routes/admin';
import metaRoutes from './routes/meta';
import { formatDateForMySQL, generateUUID } from './utils/helpers';
import { RowDataPacket } from 'mysql2';

const app = express();
const PORT = parseInt(process.env.PORT || '8001');

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS || '*';
app.use(cors({
  origin: corsOrigins === '*' ? '*' : corsOrigins.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API routes - all prefixed with /api
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/config', adminRoutes);
app.use('/api/meta', metaRoutes);

// Root API endpoint
app.get('/api/', (req: Request, res: Response) => {
  res.json({ message: 'Bidinn CRM API', version: '1.0.0' });
});

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ detail: 'Internal server error' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ detail: 'Not found' });
});

// Auto-reset job function (runs daily)
const runAutoResetJob = async () => {
  console.log('Running 30-day auto-reset job...');
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

        // Log activity
        const activityId = generateUUID();
        await pool.execute(
          'INSERT INTO activities (id, lead_id, user_id, user_name, action, details, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
          [activityId, lead.id, 'System', 'Auto-reset', 'Lead reset due to 30 days of inactivity', now]
        );

        // Notify managers
        const [managers] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM users WHERE role IN ('admin', 'manager')`
        );

        for (const manager of managers) {
          const notifId = generateUUID();
          await pool.execute(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, lead_id, created_at) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?)',
            [notifId, manager.id, 'Lead Auto-Reset', `Lead '${lead.name}' has been reset due to inactivity`, 'auto_reset', lead.id, now]
          );
        }

        resetCount++;
      }
    }

    console.log(`Auto-reset job completed. ${resetCount} leads reset.`);
  } catch (error) {
    console.error('Auto-reset job error:', error);
  }
};

// Schedule auto-reset job to run daily at midnight
const scheduleAutoResetJob = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  // Run at next midnight, then every 24 hours
  setTimeout(() => {
    runAutoResetJob();
    setInterval(runAutoResetJob, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  
  console.log(`Auto-reset job scheduled. Next run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
};

// Initialize database and start server
const startServer = async () => {
  try {
    await initDatabase();
    console.log('Database initialized successfully');

    // Auto-seed if database is empty
    await autoSeedIfEmpty();

    // Schedule the auto-reset job
    scheduleAutoResetJob();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Bidinn CRM API server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Auto-seed database if empty
const autoSeedIfEmpty = async () => {
  try {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM users');
    const userCount = users[0].count;

    if (userCount === 0) {
      console.log('Database is empty, auto-seeding demo data...');
      await seedDemoData();
      console.log('Auto-seed completed successfully');
    } else {
      console.log(`Database has ${userCount} users, skipping auto-seed`);
    }
  } catch (error) {
    console.error('Auto-seed check error:', error);
  }
};

// Seed demo data function
const seedDemoData = async () => {
  const { hashPassword } = await import('./utils/helpers');
  
  // Demo users with roles
  const demoUsers = [
    { email: 'alex@bidinn.com', name: 'Alex Thompson', role: 'admin', password: 'password123' },
    { email: 'sarah@bidinn.com', name: 'Sarah Wilson', role: 'manager', password: 'password123' },
    { email: 'michael@bidinn.com', name: 'Michael Chen', role: 'team_lead', password: 'password123' },
    { email: 'emily@bidinn.com', name: 'Emily Davis', role: 'sales_rep', password: 'password123' },
    { email: 'james@bidinn.com', name: 'James Miller', role: 'sales_rep', password: 'password123' },
    { email: 'olivia@bidinn.com', name: 'Olivia Brown', role: 'sales_rep', password: 'password123' },
    { email: 'william@bidinn.com', name: 'William Taylor', role: 'sales_rep', password: 'password123' },
    { email: 'sophia@bidinn.com', name: 'Sophia Martinez', role: 'sales_rep', password: 'password123' },
    { email: 'benjamin@bidinn.com', name: 'Benjamin Garcia', role: 'team_lead', password: 'password123' },
    { email: 'ava@bidinn.com', name: 'Ava Johnson', role: 'sales_rep', password: 'password123' },
    { email: 'lucas@bidinn.com', name: 'Lucas Anderson', role: 'sales_rep', password: 'password123' },
    { email: 'mia@bidinn.com', name: 'Mia Thomas', role: 'sales_rep', password: 'password123' },
    { email: 'robert@bidinn.com', name: 'Robert Taylor', role: 'manager', password: 'password123' },
    { email: 'lisa@bidinn.com', name: 'Lisa Anderson', role: 'sales_rep', password: 'password123' },
    { email: 'david@bidinn.com', name: 'David Wilson', role: 'sales_rep', password: 'password123' },
  ];

  const userIds: string[] = [];
  const now = formatDateForMySQL(new Date());

  // Insert users
  for (const user of demoUsers) {
    const id = generateUUID();
    userIds.push(id);
    const passwordHash = hashPassword(user.password);
    await pool.execute(
      'INSERT INTO users (id, email, name, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, true, ?)',
      [id, user.email, user.name, user.role, passwordHash, now]
    );
  }

  // Demo leads
  const leadSources = ['Website', 'Referral', 'LinkedIn', 'Cold Call', 'Meta Lead Ads', 'Trade Show', 'Email Campaign'];
  const leadStatuses = ['new', 'contacted', 'interested', 'followup', 'negotiation', 'won', 'lost', 'not_interested'];
  const companies = ['Acme Corporation', 'TechStart Inc', 'Global Solutions', 'Innovate Labs', 'Prime Services', 'NextGen Systems', 'DataFlow Corp', 'CloudNine Ltd', 'Digital Dynamics', 'Smart Solutions'];

  const salesRepIds = userIds.filter((_, i) => ['sales_rep', 'team_lead'].includes(demoUsers[i].role));

  for (let i = 0; i < 50; i++) {
    const leadId = generateUUID();
    const status = leadStatuses[Math.floor(Math.random() * leadStatuses.length)];
    const source = leadSources[Math.floor(Math.random() * leadSources.length)];
    const assignedTo = salesRepIds[Math.floor(Math.random() * salesRepIds.length)];
    const assignedUser = demoUsers[userIds.indexOf(assignedTo)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    
    const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const lastActivity = new Date(createdAt.getTime() + Math.random() * (Date.now() - createdAt.getTime()));

    await pool.execute(
      `INSERT INTO leads (id, name, phone, email, city, source, status, assigned_to, assigned_name, notes, created_at, updated_at, last_activity, attempt_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId,
        company,
        `+91 ${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
        `contact@${company.toLowerCase().replace(/\s+/g, '')}.com`,
        ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata'][Math.floor(Math.random() * 7)],
        source,
        status,
        assignedTo,
        assignedUser.name,
        `Interested in enterprise package. Budget: ₹${Math.floor(Math.random() * 500000 + 50000)}`,
        formatDateForMySQL(createdAt),
        formatDateForMySQL(lastActivity),
        formatDateForMySQL(lastActivity),
        Math.floor(Math.random() * 5)
      ]
    );

    // Add booking for won leads
    if (status === 'won') {
      const bookingId = generateUUID();
      const price = Math.floor(Math.random() * 100000 + 20000);
      await pool.execute(
        `INSERT INTO bookings (id, lead_id, final_price, status, booking_date, booking_reason, notes, created_at)
         VALUES (?, ?, ?, 'confirmed', ?, 'Product Demo', 'Deal closed successfully', ?)`,
        [bookingId, leadId, price, formatDateForMySQL(lastActivity), formatDateForMySQL(lastActivity)]
      );
    }
  }

  console.log('Seeded 15 users, 50 leads, and related data');
};

startServer();
