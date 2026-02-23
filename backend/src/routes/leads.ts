import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import multer from 'multer';
import * as XLSX from 'xlsx';
import pool from '../config/database';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { UserRole, LeadStatus, Lead, LeadResponse } from '../types';
import { generateUUID, formatDateForMySQL, calculateLeadMetrics, addActivity, createNotification } from '../utils/helpers';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Create lead
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone, email, source, campaign, city, notes, next_followup } = req.body;
    const user = req.user!;

    const id = generateUUID();
    const now = formatDateForMySQL(new Date());

    await pool.execute(
      `INSERT INTO leads (id, name, phone, email, source, campaign, city, status, assigned_to, assigned_name, attempt_count, last_activity, next_followup, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, NULL, 0, NULL, ?, ?, ?, ?)`,
      [id, name, phone, email || null, source, campaign || null, city || null, next_followup || null, notes || null, now, now]
    );

    await addActivity(id, 'Lead created', `New lead from ${source}`, user.id, user.name);

    const lead: Lead = {
      id,
      name,
      phone,
      email,
      source,
      campaign,
      city,
      status: LeadStatus.NEW,
      assigned_to: undefined,
      assigned_name: undefined,
      attempt_count: 0,
      last_activity: undefined,
      next_followup,
      notes,
      created_at: now,
      updated_at: now
    };

    res.status(201).json(calculateLeadMetrics(lead));
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ detail: 'Failed to create lead' });
  }
});

// Get leads
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { status, assigned_to, source, search, skip = '0', limit = '100' } = req.query;

    let query = 'SELECT * FROM leads WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (assigned_to) {
      query += ' AND assigned_to = ?';
      params.push(assigned_to);
    }
    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }
    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Sales reps can only see their assigned leads or unassigned leads
    if (user.role === UserRole.SALES_REP) {
      query += ' AND (assigned_to = ? OR assigned_to IS NULL)';
      params.push(user.id);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(skip as string));

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);

    const leads = (rows as Lead[]).map(lead => calculateLeadMetrics(lead));
    res.json(leads);
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ detail: 'Failed to fetch leads' });
  }
});

// Get uncontacted leads (>1hr)
router.get('/uncontacted', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: Request, res: Response): Promise<void> => {
  try {
    const oneHourAgo = formatDateForMySQL(new Date(Date.now() - 60 * 60 * 1000));

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM leads 
       WHERE status = 'new' AND attempt_count = 0 AND created_at < ?
       ORDER BY created_at ASC`,
      [oneHourAgo]
    );

    const leads = (rows as Lead[]).map(lead => calculateLeadMetrics(lead));
    res.json(leads);
  } catch (error) {
    console.error('Get uncontacted leads error:', error);
    res.status(500).json({ detail: 'Failed to fetch uncontacted leads' });
  }
});

// Import leads from file
router.post('/import', authMiddleware, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const file = req.file;

    if (!file) {
      res.status(400).json({ detail: 'No file provided' });
      return;
    }

    const filename = file.originalname.toLowerCase();
    if (!filename.endsWith('.csv') && !filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      res.status(400).json({ detail: 'Only CSV and Excel files are supported' });
      return;
    }

    let leadsData: any[] = [];

    if (filename.endsWith('.csv')) {
      const content = file.buffer.toString('utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        res.status(400).json({ detail: 'CSV file is empty or has no data rows' });
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim() || '';
        });
        leadsData.push(row);
      }
    } else {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      leadsData = XLSX.utils.sheet_to_json(sheet);
    }

    // Column mapping
    const columnMap: { [key: string]: string[] } = {
      'name': ['name', 'lead name', 'full name', 'customer name', 'client name', 'company', 'company name'],
      'phone': ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'telephone', 'tel'],
      'email': ['email', 'email address', 'e-mail', 'mail'],
      'source': ['source', 'lead source', 'channel', 'origin'],
      'campaign': ['campaign', 'campaign name', 'marketing campaign'],
      'city': ['city', 'location', 'area', 'region'],
      'notes': ['notes', 'note', 'comments', 'comment', 'description', 'remarks']
    };

    const findColumnValue = (row: any, fieldNames: string[]): any => {
      for (const field of fieldNames) {
        for (const key of Object.keys(row)) {
          if (key.toLowerCase().trim() === field) {
            return row[key];
          }
        }
      }
      return null;
    };

    const now = formatDateForMySQL(new Date());
    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const validSources = ['Website', 'Referral', 'Google Ads', 'Facebook', 'LinkedIn', 'Cold Call', 'Trade Show', 'Partner', 'Import'];

    for (let i = 0; i < leadsData.length; i++) {
      try {
        const row = leadsData[i];
        const name = findColumnValue(row, columnMap['name']);
        const phone = findColumnValue(row, columnMap['phone']);

        if (!name || !phone) {
          skippedCount++;
          errors.push(`Row ${i + 2}: Missing name or phone`);
          continue;
        }

        const phoneStr = String(phone).trim();

        // Check for duplicate
        const [existing] = await pool.execute<RowDataPacket[]>(
          'SELECT id FROM leads WHERE phone = ?',
          [phoneStr]
        );

        if (existing.length > 0) {
          skippedCount++;
          errors.push(`Row ${i + 2}: Duplicate phone ${phoneStr}`);
          continue;
        }

        let source = findColumnValue(row, columnMap['source']) || 'Import';
        if (!validSources.includes(source)) {
          source = 'Import';
        }

        const id = generateUUID();
        await pool.execute(
          `INSERT INTO leads (id, name, phone, email, source, campaign, city, status, assigned_to, assigned_name, attempt_count, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, NULL, 0, ?, ?, ?)`,
          [
            id,
            String(name).trim(),
            phoneStr,
            findColumnValue(row, columnMap['email']) || null,
            source,
            findColumnValue(row, columnMap['campaign']) || null,
            findColumnValue(row, columnMap['city']) || null,
            findColumnValue(row, columnMap['notes']) || null,
            now,
            now
          ]
        );

        await addActivity(id, 'Lead imported', `Imported from ${file.originalname}`, user.id, user.name);
        importedCount++;
      } catch (err: any) {
        skippedCount++;
        errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    res.json({
      message: 'Import completed',
      imported: importedCount,
      skipped: skippedCount,
      total_rows: leadsData.length,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Import leads error:', error);
    res.status(400).json({ detail: 'Failed to parse file' });
  }
});

// Get import template
router.get('/import/template', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  res.json({
    required_columns: ['name', 'phone'],
    optional_columns: ['email', 'source', 'campaign', 'city', 'notes'],
    valid_sources: ['Website', 'Referral', 'Google Ads', 'Facebook', 'LinkedIn', 'Cold Call', 'Trade Show', 'Partner'],
    example: {
      name: 'Acme Corporation',
      phone: '+1-555-123-4567',
      email: 'contact@acme.com',
      source: 'Google Ads',
      campaign: 'Summer Sale',
      city: 'New York',
      notes: 'Interested in premium package'
    }
  });
});

// Get lead by ID
router.get('/:leadId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM leads WHERE id = ?',
      [leadId]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'Lead not found' });
      return;
    }

    res.json(calculateLeadMetrics(rows[0] as Lead));
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ detail: 'Failed to fetch lead' });
  }
});

// Update lead
router.put('/:leadId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId } = req.params;
    const user = req.user!;
    const updateData = req.body;

    const allowedFields = ['name', 'phone', 'email', 'source', 'campaign', 'city', 'status', 'assigned_to', 'notes', 'next_followup'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(updateData[field]);
      }
    }

    // If assigning to someone, get their name
    if (updateData.assigned_to) {
      const [assignee] = await pool.execute<RowDataPacket[]>(
        'SELECT name FROM users WHERE id = ?',
        [updateData.assigned_to]
      );
      if (assignee.length > 0) {
        updates.push('assigned_name = ?');
        values.push(assignee[0].name);
      }
    }

    const now = formatDateForMySQL(new Date());
    updates.push('updated_at = ?');
    values.push(now);
    updates.push('last_activity = ?');
    values.push(now);

    values.push(leadId);
    const [result] = await pool.execute(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    await addActivity(leadId as string, 'Lead updated', JSON.stringify(updateData), user.id, user.name);

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM leads WHERE id = ?',
      [leadId]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'Lead not found' });
      return;
    }

    res.json(calculateLeadMetrics(rows[0] as Lead));
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ detail: 'Failed to update lead' });
  }
});

// Delete lead
router.delete('/:leadId', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.MANAGER]), async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId } = req.params;

    const [result]: any = await pool.execute(
      'DELETE FROM leads WHERE id = ?',
      [leadId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ detail: 'Lead not found' });
      return;
    }

    res.json({ message: 'Lead deleted' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ detail: 'Failed to delete lead' });
  }
});

// Assign lead
router.post('/:leadId/assign', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId } = req.params;
    const { assignee_id } = req.body;
    const user = req.user!;

    const [assignee] = await pool.execute<RowDataPacket[]>(
      'SELECT id, name FROM users WHERE id = ?',
      [assignee_id]
    );

    if (assignee.length === 0) {
      res.status(404).json({ detail: 'Assignee not found' });
      return;
    }

    const now = formatDateForMySQL(new Date());
    await pool.execute(
      'UPDATE leads SET assigned_to = ?, assigned_name = ?, updated_at = ? WHERE id = ?',
      [assignee_id, assignee[0].name, now, leadId]
    );

    await addActivity(leadId as string, 'Lead assigned', `Assigned to ${assignee[0].name}`, user.id, user.name);
    await createNotification(assignee_id, 'New Lead Assigned', 'You have been assigned a new lead', 'assignment', leadId as string);

    res.json({ message: 'Lead assigned successfully' });
  } catch (error) {
    console.error('Assign lead error:', error);
    res.status(500).json({ detail: 'Failed to assign lead' });
  }
});

// Log call for lead
router.post('/:leadId/log_call', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId } = req.params;
    const { outcome, duration_minutes = 0, notes, next_followup } = req.body;
    const user = req.user!;

    // Check lead exists
    const [leadRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM leads WHERE id = ?',
      [leadId]
    );

    if (leadRows.length === 0) {
      res.status(404).json({ detail: 'Lead not found' });
      return;
    }

    const lead = leadRows[0];
    const now = formatDateForMySQL(new Date());
    const callId = generateUUID();

    // Insert call log
    await pool.execute(
      `INSERT INTO calls (id, lead_id, user_id, user_name, outcome, duration_minutes, notes, next_followup, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [callId, leadId, user.id, user.name, outcome, duration_minutes, notes || null, next_followup || null, now]
    );

    // Update lead
    const newAttemptCount = (lead.attempt_count || 0) + 1;
    let newStatus = lead.status;
    
    // If connected and status is NEW, move to INTERESTED
    if (outcome === 'connected' && lead.status === 'new') {
      newStatus = 'interested';
    }

    const updateParams: any[] = [newAttemptCount, now, now, newStatus];
    let updateQuery = 'UPDATE leads SET attempt_count = ?, last_activity = ?, updated_at = ?, status = ?';
    
    if (next_followup) {
      updateQuery += ', next_followup = ?';
      updateParams.push(next_followup);
    }
    
    updateQuery += ' WHERE id = ?';
    updateParams.push(leadId);

    await pool.execute(updateQuery, updateParams);

    await addActivity(leadId, 'Call logged', `${outcome} - ${duration_minutes} min`, user.id, user.name);

    res.status(201).json({
      id: callId,
      lead_id: leadId,
      user_id: user.id,
      user_name: user.name,
      outcome,
      duration_minutes,
      notes,
      next_followup,
      created_at: now
    });
  } catch (error) {
    console.error('Log call error:', error);
    res.status(500).json({ detail: 'Failed to log call' });
  }
});

export default router;
