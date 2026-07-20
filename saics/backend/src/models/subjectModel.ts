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
};
