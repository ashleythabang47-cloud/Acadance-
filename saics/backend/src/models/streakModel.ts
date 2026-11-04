import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { toDateString, computeNextStreak, normalizeDateValue } from "../utils/streakLogic";

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

export interface DayActivity {
  date: string;
  count: number;
}

export const StreakModel = {
  /**
   * Call this whenever a student does something that should count toward
   * their streak (login, adding a performance record, completing a quiz,
   * joining a study session). Safe to call multiple times per day — only
   * the first call of the day advances the streak, subsequent calls just
   * bump that day's activity count.
   */
  async recordActivity(studentId: number): Promise<StreakInfo> {
    const today = toDateString(new Date());

    // 1. Upsert today's activity row (increment count if it already exists).
    await pool.query<ResultSetHeader>(
      `INSERT INTO daily_activity (student_id, activity_date, activity_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activity_count = activity_count + 1`,
      [studentId, today]
    );

    // 2. Fetch (or create) the streak row.
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM streaks WHERE student_id = ? LIMIT 1`,
      [studentId]
    );
    const existing = rows[0] as
      | { current_streak: number; longest_streak: number; last_activity_date: string | null }
      | undefined;

    if (!existing) {
      await pool.query(
        `INSERT INTO streaks (student_id, current_streak, longest_streak, last_activity_date)
         VALUES (?, 1, 1, ?)`,
        [studentId, today]
      );
      return { current_streak: 1, longest_streak: 1, last_activity_date: today };
    }

    const next = computeNextStreak(existing, today);
    if (!next.changed) {
      return existing as StreakInfo;
    }

    await pool.query(
      `UPDATE streaks
       SET current_streak = ?, longest_streak = ?, last_activity_date = ?
       WHERE student_id = ?`,
      [next.current_streak, next.longest_streak, next.last_activity_date, studentId]
    );

    return {
      current_streak: next.current_streak,
      longest_streak: next.longest_streak,
      last_activity_date: next.last_activity_date,
    };
  },

  async getStreakInfo(studentId: number): Promise<StreakInfo> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT current_streak, longest_streak, last_activity_date
       FROM streaks WHERE student_id = ? LIMIT 1`,
      [studentId]
    );
    return (
      (rows[0] as StreakInfo) || {
        current_streak: 0,
        longest_streak: 0,
        last_activity_date: null,
      }
    );
  },

  /** Last 7 calendar days of activity, oldest first, zero-filled for gaps. */
  async getLast7Days(studentId: number): Promise<DayActivity[]> {
    return StreakModel.getActivityRange(studentId, 7);
  },

  /**
   * The last `days` calendar days of activity (today included), oldest
   * first and zero-filled for gaps. Powers both the 7-day cadence bars and
   * the longer activity heatmap on the Streak page.
   */
  async getActivityRange(studentId: number, days: number): Promise<DayActivity[]> {
    const span = Math.min(Math.max(Math.floor(days) || 7, 1), 371);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT activity_date, activity_count
       FROM daily_activity
       WHERE student_id = ? AND activity_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY activity_date ASC`,
      [studentId, span]
    );

    const byDate = new Map<string, number>();
    for (const row of rows as { activity_date: unknown; activity_count: number }[]) {
      const key = normalizeDateValue(row.activity_date);
      if (key) byDate.set(key, Number(row.activity_count) || 0);
    }

    const result: DayActivity[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = toDateString(d);
      result.push({ date: dateStr, count: byDate.get(dateStr) || 0 });
    }
    return result;
  },
};
