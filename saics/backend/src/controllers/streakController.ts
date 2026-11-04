import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { StreakModel } from "../models/streakModel";

export async function getMyStreak(req: AuthRequest, res: Response) {
  try {
    // Optional ?days=N (8–371) adds a longer `activity` history for the
    // heatmap. Without it the response shape is unchanged.
    const requestedDays = Number(req.query.days);
    const wantsHistory = Number.isInteger(requestedDays) && requestedDays > 7;
    const [streakInfo, last7Days, activity] = await Promise.all([
      StreakModel.getStreakInfo(req.studentId!),
      StreakModel.getLast7Days(req.studentId!),
      wantsHistory ? StreakModel.getActivityRange(req.studentId!, requestedDays) : Promise.resolve(undefined),
    ]);
    return res.status(200).json({
      streak: streakInfo,
      last7Days,
      ...(activity ? { activity } : {}),
    });
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
