import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Subject {
  subject_id: number;
  subject_name: string;
  subject_code: string;
}

export const SubjectModel = {
  async findAll(): Promise<Subject[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM subjects ORDER BY subject_name ASC`
    );
    return rows as Subject[];
  },

  async findByCode(subjectCode: string): Promise<Subject | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM subjects WHERE subject_code = ? LIMIT 1`,
      [subjectCode]
    );
    return (rows[0] as Subject) || null;
  },

  async create(subjectName: string, subjectCode: string): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO subjects (subject_name, subject_code) VALUES (?, ?)`,
      [subjectName, subjectCode]
    );
    return result.insertId;
  },

  async listForStudent(studentId: number): Promise<Subject[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT s.* FROM subjects s
       JOIN student_subjects ss ON ss.subject_id = s.subject_id
       WHERE ss.student_id = ?
       ORDER BY s.subject_name ASC`,
      [studentId]
    );
    return rows as Subject[];
  },

  async enroll(studentId: number, subjectId: number): Promise<void> {
    // Idempotent — enrolling twice in the same subject is a no-op, not an error.
    await pool.query(
      `INSERT IGNORE INTO student_subjects (student_id, subject_id) VALUES (?, ?)`,
      [studentId, subjectId]
    );
  },

  async unenroll(studentId: number, subjectId: number): Promise<void> {
    await pool.query(
      `DELETE FROM student_subjects WHERE student_id = ? AND subject_id = ?`,
      [studentId, subjectId]
    );
  },
};
