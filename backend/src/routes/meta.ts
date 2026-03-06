import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../config/database';
import { generateUUID, formatDateForMySQL } from '../utils/helpers';
import { RowDataPacket } from 'mysql2';

const router = Router();

// Store Meta credentials in memory (in production, use DB or env)
interface MetaConfig {
  app_secret: string;
  verify_token: string;
  page_access_token: string;
  page_id: string;
}

let metaConfig: MetaConfig | null = null;

// Get Meta configuration
router.get('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM meta_config LIMIT 1'
    );
    
    if (rows.length === 0) {
      res.json({ configured: false });
      return;
    }
    
    // Don't expose sensitive tokens
    res.json({
      configured: true,
      page_id: rows[0].page_id,
      is_active: rows[0].is_active
    });
  } catch (error) {
    console.error('Get Meta config error:', error);
    res.status(500).json({ detail: 'Failed to get Meta configuration' });
  }
});

// Save Meta configuration (Admin only)
router.post('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const { app_secret, verify_token, page_access_token, page_id } = req.body;
    
    if (!app_secret || !verify_token || !page_access_token || !page_id) {
      res.status(400).json({ detail: 'All fields are required' });
      return;
    }
    
    // Check if config exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM meta_config LIMIT 1'
    );
    
    if (existing.length > 0) {
      // Update existing config
      await pool.execute(
        `UPDATE meta_config SET 
          app_secret = ?, 
          verify_token = ?, 
          page_access_token = ?, 
          page_id = ?,
          is_active = true,
          updated_at = ?
         WHERE id = ?`,
        [app_secret, verify_token, page_access_token, page_id, formatDateForMySQL(new Date()), existing[0].id]
      );
    } else {
      // Insert new config
      const id = generateUUID();
      await pool.execute(
        `INSERT INTO meta_config (id, app_secret, verify_token, page_access_token, page_id, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, true, ?)`,
        [id, app_secret, verify_token, page_access_token, page_id, formatDateForMySQL(new Date())]
      );
    }
    
    // Update in-memory config
    metaConfig = { app_secret, verify_token, page_access_token, page_id };
    
    res.json({ message: 'Meta configuration saved successfully' });
  } catch (error) {
    console.error('Save Meta config error:', error);
    res.status(500).json({ detail: 'Failed to save Meta configuration' });
  }
});

// Load config from DB on startup
async function loadMetaConfig(): Promise<void> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM meta_config WHERE is_active = true LIMIT 1'
    );
    
    if (rows.length > 0) {
      metaConfig = {
        app_secret: rows[0].app_secret,
        verify_token: rows[0].verify_token,
        page_access_token: rows[0].page_access_token,
        page_id: rows[0].page_id
      };
      console.log('Meta config loaded from database');
    }
  } catch (error) {
    console.error('Failed to load Meta config:', error);
  }
}

// Initialize config on module load
loadMetaConfig();

// Webhook verification endpoint (GET)
router.get('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;
    
    console.log('Meta webhook verification request:', { mode, token, challenge });
    
    if (!metaConfig) {
      // Try to load config
      await loadMetaConfig();
    }
    
    if (!metaConfig) {
      console.error('Meta config not found');
      res.status(403).send('Configuration not found');
      return;
    }
    
    if (mode !== 'subscribe') {
      res.status(403).send('Invalid mode');
      return;
    }
    
    if (token !== metaConfig.verify_token) {
      console.error('Token mismatch:', { received: token, expected: metaConfig.verify_token });
      res.status(403).send('Invalid verify token');
      return;
    }
    
    console.log('Meta webhook verified successfully');
    res.status(200).send(challenge);
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(500).send('Internal server error');
  }
});

// Webhook receive endpoint (POST)
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody = JSON.stringify(req.body);
    
    if (!metaConfig) {
      await loadMetaConfig();
    }
    
    if (!metaConfig) {
      console.error('Meta config not found for webhook');
      res.status(200).json({ status: 'config_missing' });
      return;
    }
    
    // Verify signature
    if (signature) {
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', metaConfig.app_secret)
        .update(rawBody)
        .digest('hex');
      
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error('Invalid webhook signature');
        res.status(200).json({ status: 'invalid_signature' });
        return;
      }
    }
    
    const payload = req.body;
    console.log('Meta webhook received:', JSON.stringify(payload, null, 2));
    
    // Validate payload structure
    if (payload.object !== 'page') {
      console.warn('Unexpected object type:', payload.object);
      res.status(200).json({ status: 'received' });
      return;
    }
    
    // Process each entry
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      
      for (const change of changes) {
        if (change.field === 'leadgen') {
          const leadgenInfo = change.value;
          const leadgenId = leadgenInfo.leadgen_id;
          
          // Fetch lead details from Meta Graph API
          await processMetaLead(leadgenId, leadgenInfo);
        }
      }
    }
    
    // Respond immediately to acknowledge receipt
    res.status(200).json({ status: 'received' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(200).json({ status: 'error' });
  }
});

// Process a single lead from Meta
async function processMetaLead(leadgenId: string, leadgenInfo: any): Promise<void> {
  try {
    if (!metaConfig) {
      console.error('Meta config not available for lead processing');
      return;
    }
    
    // Fetch complete lead details from Meta Graph API
    const leadDetails = await fetchLeadDetails(leadgenId);
    
    if (!leadDetails) {
      console.error('Failed to fetch lead details for:', leadgenId);
      return;
    }
    
    // Extract field data
    const fieldData = leadDetails.field_data || [];
    let name = '';
    let email = '';
    let phone = '';
    
    for (const field of fieldData) {
      const fieldName = field.name.toLowerCase();
      const fieldValue = field.values?.[0] || '';
      
      if (fieldName.includes('name') || fieldName.includes('full_name')) {
        name = fieldValue;
      } else if (fieldName.includes('email')) {
        email = fieldValue;
      } else if (fieldName.includes('phone') || fieldName.includes('mobile')) {
        phone = fieldValue;
      }
    }
    
    // Create lead in Bidinn
    const leadId = generateUUID();
    const now = formatDateForMySQL(new Date());
    
    // Get default assignee (first active sales rep or team lead)
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name FROM users WHERE role IN ('sales_rep', 'team_lead') AND is_active = true LIMIT 1`
    );
    
    const assignedTo = users.length > 0 ? users[0].id : null;
    const assignedName = users.length > 0 ? users[0].name : null;
    
    // Insert lead
    await pool.execute(
      `INSERT INTO leads (
        id, name, phone, email, source, status, 
        assigned_to, assigned_name, 
        notes, created_at, updated_at, last_activity,
        attempt_count, meta_leadgen_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId,
        name || 'Meta Lead',
        phone || '',
        email || '',
        'Meta Lead Ads',
        'new',
        assignedTo,
        assignedName,
        `Imported from Meta Lead Ads. Form ID: ${leadDetails.form_id || 'N/A'}`,
        now,
        now,
        now,
        0,
        leadgenId
      ]
    );
    
    console.log(`Lead created from Meta: ${leadId} (${name}, ${email}, ${phone})`);
    
    // Create activity log
    await pool.execute(
      `INSERT INTO activities (id, user_id, action, target_id, target_type, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generateUUID(),
        null,
        'Lead imported from Meta',
        leadId,
        'lead',
        `New lead from Facebook/Instagram Lead Ads: ${name}`,
        now
      ]
    );
    
  } catch (error) {
    console.error('Error processing Meta lead:', error);
  }
}

// Fetch lead details from Meta Graph API
async function fetchLeadDetails(leadgenId: string): Promise<any> {
  try {
    if (!metaConfig) return null;
    
    const url = `https://graph.facebook.com/v20.0/${leadgenId}`;
    const params = new URLSearchParams({
      access_token: metaConfig.page_access_token,
      fields: 'id,created_time,ad_id,form_id,field_data'
    });
    
    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Meta API error:', error);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching lead from Meta:', error);
    return null;
  }
}

// Get Meta leads history
router.get('/leads', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM leads WHERE source = 'Meta Lead Ads' ORDER BY created_at DESC LIMIT 50`
    );
    
    res.json(rows);
  } catch (error) {
    console.error('Get Meta leads error:', error);
    res.status(500).json({ detail: 'Failed to fetch Meta leads' });
  }
});

// Test Meta connection
router.post('/test-connection', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!metaConfig) {
      await loadMetaConfig();
    }
    
    if (!metaConfig) {
      res.status(400).json({ detail: 'Meta not configured' });
      return;
    }
    
    // Test by fetching page info
    const url = `https://graph.facebook.com/v20.0/${metaConfig.page_id}`;
    const params = new URLSearchParams({
      access_token: metaConfig.page_access_token,
      fields: 'id,name'
    });
    
    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      const errorData: any = await response.json();
      res.status(400).json({ 
        detail: 'Meta API error', 
        error: errorData.error?.message || 'Unknown error' 
      });
      return;
    }
    
    const pageInfo: any = await response.json();
    res.json({ 
      success: true, 
      message: 'Connection successful',
      page_name: pageInfo.name,
      page_id: pageInfo.id
    });
  } catch (error) {
    console.error('Test Meta connection error:', error);
    res.status(500).json({ detail: 'Failed to test Meta connection' });
  }
});

export default router;
