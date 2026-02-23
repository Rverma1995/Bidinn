import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { UserRole, UserResponse } from '../types';
import { hashPassword, verifyPassword, createToken, generateUUID, formatDateForMySQL } from '../utils/helpers';

const router = Router();

// Register new user
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, password, role = 'sales_rep', avatar } = req.body;

    // Check if email exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      res.status(400).json({ detail: 'Email already registered' });
      return;
    }

    const id = generateUUID();
    const passwordHash = hashPassword(password);
    const createdAt = formatDateForMySQL(new Date());

    await pool.execute(
      'INSERT INTO users (id, email, name, role, avatar, is_active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)',
      [id, email, name, role, avatar || null, passwordHash, createdAt]
    );

    const response: UserResponse = {
      id,
      email,
      name,
      role,
      avatar,
      is_active: true,
      created_at: createdAt
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ detail: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    const user = rows[0];

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({ detail: 'Invalid credentials' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ detail: 'Account is disabled' });
      return;
    }

    const token = createToken(user.id, user.role);

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        is_active: user.is_active,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ detail: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  res.json(req.user);
});

export default router;
