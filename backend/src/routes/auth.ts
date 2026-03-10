import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const userRepository = () => AppDataSource.getRepository(User);

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password required" });
    }

    const user = await userRepository().findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    if (!user.is_active) {
      return res.status(401).json({ detail: "Account is deactivated" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "24h" }
    );

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ access_token: token, user: userWithoutPassword });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get current user
router.get("/me", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepository().findOne({ where: { id: req.user!.id } });

    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Change password
router.post("/change-password", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ detail: "Current password and new password are required" });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ detail: "New password must be at least 6 characters" });
    }

    const user = await userRepository().findOne({ where: { id: req.user!.id } });

    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    const validPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ detail: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    user.password_hash = hashedPassword;
    await userRepository().save(user);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
