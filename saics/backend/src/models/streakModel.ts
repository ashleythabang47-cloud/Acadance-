import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

export interface DayActivity {
  date: string;
  count: number;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const dateA = new Date(a + "T00:00:00Z");
  const dateB = new Date(b + "T00:00:00Z");
  return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
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

    // Already recorded today — streak doesn't change further today.
    if (existing.last_activity_date === today) {
      return existing as StreakInfo;
    }

    let newCurrent: number;
    if (existing.last_activity_date) {
      const gap = daysBetween(existing.last_activity_date, today);
      newCurrent = gap === 1 ? existing.current_streak + 1 : 1;
    } else {
      newCurrent = 1;
    }
    const newLongest = Math.max(existing.longest_streak, newCurrent);

    await pool.query(
      `UPDATE streaks
       SET current_streak = ?, longest_streak = ?, last_activity_date = ?
       WHERE student_id = ?`,
      [newCurrent, newLongest, today, studentId]
    );

    return { current_streak: newCurrent, longest_streak: newLongest, last_activity_date: today };
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
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT activity_date, activity_count
       FROM daily_activity
       WHERE student_id = ? AND activity_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       ORDER BY activity_date ASC`,
      [studentId]
    );

    const byDate = new Map<string, number>();
    for (const row of rows as { activity_date: string; activity_count: number }[]) {
      byDate.set(row.activity_date, row.activity_count);
    }

    const result: DayActivity[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = toDateString(d);
      result.push({ date: dateStr, count: byDate.get(dateStr) || 0 });
    }
    return result;
  },
};
