import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { LeadStatus, LeadResponse, Lead } from '../types';
import { RowDataPacket } from 'mysql2';

const JWT_SECRET = process.env.JWT_SECRET || 'bidinn-secret-key';
const JWT_EXPIRATION_HOURS = 24;

export const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, 10);
};

export const verifyPassword = (password: string, hash: string): boolean => {
  return bcrypt.compareSync(password, hash);
};

export const createToken = (userId: string, role: string): string => {
  const payload = {
    sub: userId,
    role: role,
    exp: Math.floor(Date.now() / 1000) + (JWT_EXPIRATION_HOURS * 60 * 60)
  };
  return jwt.sign(payload, JWT_SECRET);
};

export const generateUUID = (): string => {
  return uuidv4();
};

export const formatDateForMySQL = (date: Date): string => {
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

export const calculateLeadMetrics = (lead: Lead): LeadResponse => {
  const createdAt = new Date(lead.created_at);
  const now = new Date();
  const hoursSince = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  let isOverdue = false;
  if (lead.status === LeadStatus.NEW && lead.attempt_count === 0) {
    isOverdue = hoursSince > 1;
  }

  return {
    ...lead,
    hours_since_creation: Math.round(hoursSince * 100) / 100,
    is_overdue: isOverdue
  };
};

export const addActivity = async (
  leadId: string,
  action: string,
  details?: string,
  userId?: string,
  userName?: string
): Promise<void> => {
  const id = generateUUID();
  const createdAt = formatDateForMySQL(new Date());
  
  await pool.execute(
    'INSERT INTO activities (id, lead_id, user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, leadId, userId || null, userName || null, action, details || null, createdAt]
  );
};

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: string,
  leadId?: string
): Promise<void> => {
  const id = generateUUID();
  const createdAt = formatDateForMySQL(new Date());
  
  await pool.execute(
    'INSERT INTO notifications (id, user_id, title, message, type, is_read, lead_id, created_at) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?)',
    [id, userId, title, message, type, leadId || null, createdAt]
  );
};
