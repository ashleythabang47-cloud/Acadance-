import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Notification {
  notification_id: number;
  student_id: number;
  message: string;
  type: "alert" | "reminder" | "suggestion";
  is_read: boolean;
  created_at: string;
}

export const NotificationModel = {
  async create(
    studentId: number,
    message: string,
    type: "alert" | "reminder" | "suggestion"
  ): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO notifications (student_id, message, type) VALUES (?, ?, ?)`,
      [studentId, message, type]
    );
    return result.insertId;
  },

  async listForStudent(studentId: number, limit = 20): Promise<Notification[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM notifications WHERE student_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [studentId, limit]
    );
    return rows as Notification[];
  },

  async unreadCount(studentId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM notifications WHERE student_id = ? AND is_read = FALSE`,
      [studentId]
    );
    return (rows[0] as { count: number }).count;
  },

  async markAsRead(notificationId: number, studentId: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE notifications SET is_read = TRUE
       WHERE notification_id = ? AND student_id = ?`,
      [notificationId, studentId]
    );
    return result.affectedRows > 0;
  },

  async markAllAsRead(studentId: number): Promise<void> {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE student_id = ? AND is_read = FALSE`,
      [studentId]
    );
  },
};
