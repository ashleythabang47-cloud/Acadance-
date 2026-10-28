"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyStreak = getMyStreak;
exports.checkIn = checkIn;
const streakModel_1 = require("../models/streakModel");
async function getMyStreak(req, res) {
    try {
        const [streakInfo, last7Days] = await Promise.all([
            streakModel_1.StreakModel.getStreakInfo(req.studentId),
            streakModel_1.StreakModel.getLast7Days(req.studentId),
        ]);
        return res.status(200).json({ streak: streakInfo, last7Days });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching streak." });
    }
}
// Called whenever the frontend wants to mark today as active without
// tying it to a specific action (e.g. simply visiting the dashboard).
async function checkIn(req, res) {
    try {
        const streak = await streakModel_1.StreakModel.recordActivity(req.studentId);
        return res.status(200).json({ message: "Activity recorded.", streak });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error recording activity." });
    }
}
