import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities";

const JWT_SECRET = process.env.JWT_SECRET || "bidinn-secret-key";

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ detail: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.sub },
      select: ["id", "email", "name", "role", "is_active"],
    });

    if (!user) {
      res.status(401).json({ detail: "User not found" });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ detail: "Account is disabled" });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ detail: "Token expired" });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ detail: "Invalid token" });
      return;
    }
    console.error("Auth error:", error);
    res.status(500).json({ detail: "Authentication error" });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ detail: "Not authenticated" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ detail: "Insufficient permissions" });
      return;
    }

    next();
  };
};

// Alias for backward compatibility
export const authMiddleware = authenticateToken;
export const requireRoles = requireRole;
