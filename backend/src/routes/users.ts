import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const userRepository = () => AppDataSource.getRepository(User);

// Get all users
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const users = await userRepository().find({
      order: { created_at: "DESC" },
      select: ["id", "email", "name", "role", "is_active", "created_at"],
    });
    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get user by ID
router.get("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
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

// Create user (Admin/Manager only)
router.post("/", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { email, name, password, role } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ detail: "Email, name, and password are required" });
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

// Update user (Admin/Manager only)
router.put("/:id", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, is_active } = req.body;
    const userId = req.params.id as string;

    const user = await userRepository().findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
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
    if (role) user.role = role;
    if (typeof is_active === "boolean") user.is_active = is_active;

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

// Delete user (Admin only)
router.delete("/:id", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;
    const user = await userRepository().findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    await userRepository().remove(user);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
