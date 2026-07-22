import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Student {
  student_id: number;
  full_name: string;
  email: string;
  password_hash: string;
  role: "student" | "admin";
  bio: string | null;
  academic_year: string | null;
  avatar_color: string;
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
      `SELECT student_id, full_name, email, role, bio, academic_year, avatar_color, created_at
       FROM students WHERE student_id = ? LIMIT 1`,
      [studentId]
    );
    return (rows[0] as Student) || null;
  },

  async updateProfile(
    studentId: number,
    updates: Partial<{
      fullName: string;
      bio: string;
      academicYear: string;
      avatarColor: string;
    }>
  ): Promise<boolean> {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.fullName !== undefined) {
      fields.push("full_name = ?");
      values.push(updates.fullName);
    }
    if (updates.bio !== undefined) {
      fields.push("bio = ?");
      values.push(updates.bio);
    }
    if (updates.academicYear !== undefined) {
      fields.push("academic_year = ?");
      values.push(updates.academicYear);
    }
    if (updates.avatarColor !== undefined) {
      fields.push("avatar_color = ?");
      values.push(updates.avatarColor);
    }

    if (fields.length === 0) return false;

    values.push(studentId);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE students SET ${fields.join(", ")} WHERE student_id = ?`,
      values
    );
    return result.affectedRows > 0;
  },
};
