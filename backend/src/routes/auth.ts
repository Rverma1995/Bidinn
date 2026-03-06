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

// Change password (for logged-in user)
router.post('/change-password', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { current_password, new_password } = req.body;
    const user = req.user!;

    if (!current_password || !new_password) {
      res.status(400).json({ detail: 'Current password and new password are required' });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({ detail: 'New password must be at least 6 characters' });
      return;
    }

    // Get user with password hash
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT password_hash FROM users WHERE id = ?',
      [user.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'User not found' });
      return;
    }

    // Verify current password
    if (!verifyPassword(current_password, rows[0].password_hash)) {
      res.status(401).json({ detail: 'Current password is incorrect' });
      return;
    }

    // Update password
    const newPasswordHash = hashPassword(new_password);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ detail: 'Failed to change password' });
  }
});

export default router;
