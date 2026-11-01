import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; startedAt: number }>();

export function adminActionRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = attempts.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    attempts.set(key, { count: 1, startedAt: now });
    return next();
  }
  if (current.count >= MAX_ATTEMPTS) {
    res.setHeader("Retry-After", String(Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1000)));
    return res.status(429).json({ message: "Too many account-management actions. Please try again later." });
  }
  current.count += 1;
  return next();
}
