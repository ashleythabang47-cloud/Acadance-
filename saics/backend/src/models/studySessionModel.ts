import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface StudySession {
  session_id: number;
  subject_id: number | null;
  subject_name?: string;
  host_id: number;
  host_name?: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  participant_count?: number;
}

export const StudySessionModel = {
  async create(hostId: number, title: string, subjectId: number | null): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO study_sessions (subject_id, host_id, title) VALUES (?, ?, ?)`,
      [subjectId, hostId, title]
    );
    // The host automatically joins their own session.
    await pool.query(
      `INSERT INTO study_session_participants (session_id, student_id) VALUES (?, ?)`,
      [result.insertId, hostId]
    );
    return result.insertId;
  },

  // Only sessions that haven't been ended, with a live participant count.
  async findActive(): Promise<StudySession[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ss.*, s.subject_name, st.full_name AS host_name,
              (SELECT COUNT(*) FROM study_session_participants ssp
               WHERE ssp.session_id = ss.session_id AND ssp.left_at IS NULL) AS participant_count
       FROM study_sessions ss
       LEFT JOIN subjects s ON s.subject_id = ss.subject_id
       JOIN students st ON st.student_id = ss.host_id
       WHERE ss.ended_at IS NULL
       ORDER BY ss.started_at DESC`
    );
    return rows as StudySession[];
  },

  async findById(sessionId: number): Promise<StudySession | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ss.*, s.subject_name, st.full_name AS host_name
       FROM study_sessions ss
       LEFT JOIN subjects s ON s.subject_id = ss.subject_id
       JOIN students st ON st.student_id = ss.host_id
       WHERE ss.session_id = ? LIMIT 1`,
      [sessionId]
    );
    return (rows[0] as StudySession) || null;
  },

  async join(sessionId: number, studentId: number): Promise<void> {
    // (session_id, student_id) is a composite primary key, so a student can
    // only ever have one row per session. Re-joining (after leaving, or a
    // duplicate click) must update that row rather than insert a new one.
    await pool.query(
      `INSERT INTO study_session_participants (session_id, student_id, joined_at, left_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
       ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP, left_at = NULL`,
      [sessionId, studentId]
    );
  },

  async leave(sessionId: number, studentId: number): Promise<void> {
    await pool.query(
      `UPDATE study_session_participants
       SET left_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND student_id = ? AND left_at IS NULL`,
      [sessionId, studentId]
    );
  },

  async getActiveParticipants(
    sessionId: number
  ): Promise<{ student_id: number; full_name: string }[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT st.student_id, st.full_name
       FROM study_session_participants ssp
       JOIN students st ON st.student_id = ssp.student_id
       WHERE ssp.session_id = ? AND ssp.left_at IS NULL`,
      [sessionId]
    );
    return rows as { student_id: number; full_name: string }[];
  },

  async end(sessionId: number, hostId: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE study_sessions SET ended_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND host_id = ? AND ended_at IS NULL`,
      [sessionId, hostId]
    );
    return result.affectedRows > 0;
  },
};
