import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { StreakModel } from "../models/streakModel";

export async function getMyStreak(req: AuthRequest, res: Response) {
  try {
    const [streakInfo, last7Days] = await Promise.all([
      StreakModel.getStreakInfo(req.studentId!),
      StreakModel.getLast7Days(req.studentId!),
    ]);
    return res.status(200).json({ streak: streakInfo, last7Days });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching streak." });
  }
}

// Called whenever the frontend wants to mark today as active without
// tying it to a specific action (e.g. simply visiting the dashboard).
export async function checkIn(req: AuthRequest, res: Response) {
  try {
    const streak = await StreakModel.recordActivity(req.studentId!);
    return res.status(200).json({ message: "Activity recorded.", streak });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error recording activity." });
  }
}
