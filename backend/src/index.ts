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

startServer();
