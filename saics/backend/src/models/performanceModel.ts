import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface PerformanceRecord {
  record_id: number;
  student_id: number;
  subject_id: number;
  subject_name?: string;
  assessment_name: string;
  score: number;
  max_score: number;
  assessment_date: string;
  created_at?: string;
}

export const PerformanceModel = {
  // Joins subjects so the frontend gets the subject name without a second call.
  async findByStudent(studentId: number): Promise<PerformanceRecord[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT pr.*, s.subject_name
       FROM performance_records pr
       JOIN subjects s ON s.subject_id = pr.subject_id
       WHERE pr.student_id = ?
       ORDER BY pr.assessment_date DESC, pr.record_id DESC`,
      [studentId]
    );
    return rows as PerformanceRecord[];
  },

  async findOne(recordId: number, studentId: number): Promise<PerformanceRecord | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM performance_records WHERE record_id = ? AND student_id = ? LIMIT 1`,
      [recordId, studentId]
    );
    return (rows[0] as PerformanceRecord) || null;
  },

  async create(record: {
    studentId: number;
    subjectId: number;
    assessmentName: string;
    score: number;
    maxScore: number;
    assessmentDate: string;
  }): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO performance_records
        (student_id, subject_id, assessment_name, score, max_score, assessment_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.studentId,
        record.subjectId,
        record.assessmentName,
        record.score,
        record.maxScore,
        record.assessmentDate,
      ]
    );
    return result.insertId;
  },

  async update(
    recordId: number,
    studentId: number,
    updates: Partial<{
      assessmentName: string;
      score: number;
      maxScore: number;
      assessmentDate: string;
      subjectId: number;
    }>
  ): Promise<boolean> {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.assessmentName !== undefined) {
      fields.push("assessment_name = ?");
      values.push(updates.assessmentName);
    }
    if (updates.score !== undefined) {
      fields.push("score = ?");
      values.push(updates.score);
    }
    if (updates.maxScore !== undefined) {
      fields.push("max_score = ?");
      values.push(updates.maxScore);
    }
    if (updates.assessmentDate !== undefined) {
      fields.push("assessment_date = ?");
      values.push(updates.assessmentDate);
    }
    if (updates.subjectId !== undefined) {
      fields.push("subject_id = ?");
      values.push(updates.subjectId);
    }

    if (fields.length === 0) return false;

    values.push(recordId, studentId);

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE performance_records SET ${fields.join(", ")}
       WHERE record_id = ? AND student_id = ?`,
      values
    );
    return result.affectedRows > 0;
  },

  async delete(recordId: number, studentId: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM performance_records WHERE record_id = ? AND student_id = ?`,
      [recordId, studentId]
    );
    return result.affectedRows > 0;
  },
};
