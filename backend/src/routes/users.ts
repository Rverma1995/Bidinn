import { Router, Response } from "express";
import { cacheMiddleware, invalidateCacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// Automatically invalidate caches on any successful mutation in this router
router.use(invalidateCacheMiddleware([CACHE_KEYS.USERS_LIST]));

const userRepository = () => AppDataSource.getRepository(User);

// Get all users (with limit for safety)
router.get("/", authenticateToken, cacheMiddleware(CACHE_KEYS.USERS_LIST, CACHE_TTL.SHORT, false), async (req: AuthRequest, res: Response) => {
  try {
    const users = await userRepository().find({
      order: { created_at: "DESC" },
      select: ["id", "email", "name", "role", "is_active", "created_at"],
      take: 500, // Safety limit
    });
    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get user by ID
router.get("/:id", authenticateToken, cacheMiddleware(CACHE_KEYS.USERS_LIST, CACHE_TTL.SHORT, false), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;
    const user = await userRepository().findOne({
      where: { id: userId },
      select: ["id", "email", "name", "role", "is_active", "created_at"],
    });

    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Create user (Admin and Manager only)
router.post("/", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { email, name, password, role } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ detail: "Email, name, and password are required" });
    }

    // Managers cannot create admin users
    if (req.user?.role === UserRole.MANAGER && role === UserRole.ADMIN) {
      return res.status(403).json({ detail: "Managers cannot create admin users" });
    }

    const existingUser = await userRepository().findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ detail: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = userRepository().create({
      id: uuidv4(),
      email,
      name,
      password_hash: hashedPassword,
      role: role || UserRole.SALES_REP,
      is_active: true,
    });

    await userRepository().save(user);

    const { password_hash, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Update user (Admin/Manager only, or self-update for name/email)
router.put("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, is_active } = req.body;
    const userId = req.params.id as string;
    const currentUser = req.user!;

    const user = await userRepository().findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    // Check permissions: self-update allowed for name/email only, admin/manager can update everything
    const isSelfUpdate = currentUser.id === userId;
    const isAdminOrManager = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER;

    if (!isSelfUpdate && !isAdminOrManager) {
      return res.status(403).json({ detail: "You don't have permission to update this user" });
    }

    // Self-update: can only change name and email (not role or is_active)
    if (isSelfUpdate) {
      if (role || typeof is_active === "boolean") {
        return res.status(403).json({ detail: "You cannot change your own role or active status" });
      }
    }

    // Check if email is being changed to an existing email
    if (email && email !== user.email) {
      const existingUser = await userRepository().findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ detail: "Email already in use" });
      }
      user.email = email;
    }

    if (name) user.name = name;
    
    // Only admin/manager can change OTHER users' role and is_active (not their own)
    if (isAdminOrManager && !isSelfUpdate) {
      if (role) user.role = role;
      if (typeof is_active === "boolean") user.is_active = is_active;
    }

    await userRepository().save(user);

    const { password_hash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Reset user password (Admin only)
router.post("/:id/reset-password", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { new_password } = req.body;
    const userId = req.params.id as string;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ detail: "Password must be at least 6 characters" });
    }

    const user = await userRepository().findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    user.password_hash = hashedPassword;
    await userRepository().save(user);

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Delete/Deactivate user (Admin and Manager)
router.delete("/:id", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;
    const user = await userRepository().findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    // Managers cannot delete/deactivate admins
    if (req.user?.role === UserRole.MANAGER && user.role === UserRole.ADMIN) {
      return res.status(403).json({ detail: "Managers cannot deactivate admin users" });
    }

    await userRepository().remove(user);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
