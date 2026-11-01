import { Request, Response, NextFunction } from "express";
import { StudentModel } from "../models/studentModel";
import { verifyAuthToken } from "../utils/authToken";

export interface AuthRequest extends Request {
  studentId?: number;
  role?: "student" | "admin";
  forcePasswordReset?: boolean;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided." });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = verifyAuthToken(token);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  try {
    const authState = await StudentModel.findAuthState(decoded.studentId);
    if (
      !authState ||
      authState.is_suspended ||
      authState.deleted_at ||
      Number(authState.token_version) !== Number(decoded.tokenVersion || 0)
    ) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    req.studentId = decoded.studentId;
    req.role = authState.role;
    req.forcePasswordReset = authState.force_password_reset;
    if (authState.force_password_reset && req.path !== "/change-password") {
      return res.status(403).json({
        code: "PASSWORD_RESET_REQUIRED",
        message: "Change your password before continuing.",
      });
    }
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not verify the authenticated account." });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Administrator access is required." });
  }
  next();
}
