"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreakModel = void 0;
const db_1 = require("../config/db");
const streakLogic_1 = require("../utils/streakLogic");
exports.StreakModel = {
    /**
     * Call this whenever a student does something that should count toward
     * their streak (login, adding a performance record, completing a quiz,
     * joining a study session). Safe to call multiple times per day — only
     * the first call of the day advances the streak, subsequent calls just
     * bump that day's activity count.
     */
    async recordActivity(studentId) {
        const today = (0, streakLogic_1.toDateString)(new Date());
        // 1. Upsert today's activity row (increment count if it already exists).
        await db_1.pool.query(`INSERT INTO daily_activity (student_id, activity_date, activity_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activity_count = activity_count + 1`, [studentId, today]);
        // 2. Fetch (or create) the streak row.
        const [rows] = await db_1.pool.query(`SELECT * FROM streaks WHERE student_id = ? LIMIT 1`, [studentId]);
        const existing = rows[0];
        if (!existing) {
            await db_1.pool.query(`INSERT INTO streaks (student_id, current_streak, longest_streak, last_activity_date)
         VALUES (?, 1, 1, ?)`, [studentId, today]);
            return { current_streak: 1, longest_streak: 1, last_activity_date: today };
        }
        const next = (0, streakLogic_1.computeNextStreak)(existing, today);
        if (!next.changed) {
            return existing;
        }
        await db_1.pool.query(`UPDATE streaks
       SET current_streak = ?, longest_streak = ?, last_activity_date = ?
       WHERE student_id = ?`, [next.current_streak, next.longest_streak, next.last_activity_date, studentId]);
        return {
            current_streak: next.current_streak,
            longest_streak: next.longest_streak,
            last_activity_date: next.last_activity_date,
        };
    },
    async getStreakInfo(studentId) {
        const [rows] = await db_1.pool.query(`SELECT current_streak, longest_streak, last_activity_date
       FROM streaks WHERE student_id = ? LIMIT 1`, [studentId]);
        return (rows[0] || {
            current_streak: 0,
            longest_streak: 0,
            last_activity_date: null,
        });
    },
    /** Last 7 calendar days of activity, oldest first, zero-filled for gaps. */
    async getLast7Days(studentId) {
        const [rows] = await db_1.pool.query(`SELECT activity_date, activity_count
       FROM daily_activity
       WHERE student_id = ? AND activity_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       ORDER BY activity_date ASC`, [studentId]);
        const byDate = new Map();
        for (const row of rows) {
            byDate.set(row.activity_date, row.activity_count);
        }
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() - i);
            const dateStr = (0, streakLogic_1.toDateString)(d);
            result.push({ date: dateStr, count: byDate.get(dateStr) || 0 });
        }
        return result;
    },
};
