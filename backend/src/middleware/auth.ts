import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { UserRole, TokenPayload, UserResponse } from '../types';
import { RowDataPacket } from 'mysql2';

const JWT_SECRET = process.env.JWT_SECRET || 'bidinn-secret-key';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ detail: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, name, role, avatar, is_active, created_at FROM users WHERE id = ?',
      [decoded.sub]
    );

    if (rows.length === 0) {
      res.status(401).json({ detail: 'User not found' });
      return;
    }

    const user = rows[0] as UserResponse;
    if (!user.is_active) {
      res.status(401).json({ detail: 'Account is disabled' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ detail: 'Token expired' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ detail: 'Invalid token' });
      return;
    }
    res.status(500).json({ detail: 'Authentication error' });
  }
};

export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ detail: 'Not authenticated' });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ detail: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
