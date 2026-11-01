import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Student {
  student_id: number;
  full_name: string;
  email: string;
  password_hash: string;
  email_verified?: boolean;
  role: "student" | "admin";
  is_suspended: boolean;
  deleted_at: Date | null;
  token_version: number;
  force_password_reset: boolean;
  failed_login_attempts: number;
  lockout_until: Date | null;
  bio: string | null;
  academic_year: string | null;
  avatar_color: string;
  avatar_url: string | null;
  created_at?: Date;
}

export const StudentModel = {
  async create(fullName: string, email: string, passwordHash: string): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO students (full_name, email, password_hash, email_verified) VALUES (?, ?, ?, FALSE)`,
      [fullName, email, passwordHash]
    );
    return result.insertId;
  },

  async findByEmail(email: string): Promise<Student | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM students WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email]
    );
    return (rows[0] as Student) || null;
  },

  async cleanupExpiredUnverified(): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM students
       WHERE email_verified = FALSE AND role = 'student'
         AND created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)`
    );
    return result.affectedRows;
  },

  async findById(studentId: number): Promise<Student | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, role, bio, academic_year, avatar_color, avatar_url, created_at,
              is_suspended, deleted_at, token_version, force_password_reset
       FROM students WHERE student_id = ? LIMIT 1`,
      [studentId]
    );
    return (rows[0] as Student) || null;
  },

  async findByIdForLogin(studentId: number): Promise<Student | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, password_hash, role, is_suspended, deleted_at,
              token_version, force_password_reset
       FROM students WHERE student_id = ? AND deleted_at IS NULL LIMIT 1`,
      [studentId]
    );
    return (rows[0] as Student) || null;
  },

  async findAuthState(studentId: number): Promise<Pick<Student, "role" | "is_suspended" | "deleted_at" | "token_version" | "force_password_reset"> | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT role, is_suspended, deleted_at, token_version, force_password_reset
       FROM students WHERE student_id = ? LIMIT 1`,
      [studentId]
    );
    return (rows[0] as Pick<Student, "role" | "is_suspended" | "deleted_at" | "token_version" | "force_password_reset">) || null;
  },

  async updatePassword(studentId: number, passwordHash: string): Promise<void> {
    await pool.query(
      `UPDATE students
       SET password_hash = ?, force_password_reset = FALSE, token_version = token_version + 1,
           failed_login_attempts = 0, lockout_until = NULL
       WHERE student_id = ?`,
      [passwordHash, studentId]
    );
  },

  async recordFailedLogin(studentId: number): Promise<number> {
    await pool.query(
      `UPDATE students
       SET failed_login_attempts = failed_login_attempts + 1,
           lockout_until = IF(failed_login_attempts + 1 >= 5, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE), lockout_until)
       WHERE student_id = ?`,
      [studentId]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT failed_login_attempts FROM students WHERE student_id = ?`,
      [studentId]
    );
    return Number(rows[0]?.failed_login_attempts || 0);
  },

  async recordSuccessfulLogin(studentId: number): Promise<void> {
    await pool.query(
      `UPDATE students
       SET failed_login_attempts = 0, lockout_until = NULL, last_login_at = CURRENT_TIMESTAMP
       WHERE student_id = ?`,
      [studentId]
    );
  },

  async updateProfile(
    studentId: number,
    updates: Partial<{
      fullName: string;
      bio: string;
      academicYear: string;
      avatarColor: string;
      avatarUrl: string | null;
    }>
  ): Promise<boolean> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

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
    if (updates.avatarUrl !== undefined) {
      fields.push("avatar_url = ?");
      values.push(updates.avatarUrl);
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
