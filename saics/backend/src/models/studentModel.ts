import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Student {
  student_id: number;
  full_name: string;
  email: string;
  password_hash: string;
  role: "student" | "admin";
  created_at?: Date;
}

export const StudentModel = {
  async create(fullName: string, email: string, passwordHash: string): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO students (full_name, email, password_hash) VALUES (?, ?, ?)`,
      [fullName, email, passwordHash]
    );
    return result.insertId;
  },

  async findByEmail(email: string): Promise<Student | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM students WHERE email = ? LIMIT 1`,
      [email]
    );
    return (rows[0] as Student) || null;
  },

  async findById(studentId: number): Promise<Student | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, role, created_at FROM students WHERE student_id = ? LIMIT 1`,
      [studentId]
    );
    return (rows[0] as Student) || null;
  },
};
