import bcrypt from "bcrypt";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/db";

export async function seedAdminAccount(emailValue: string, password: string): Promise<"created" | "exists"> {
  const email = emailValue.trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 ||
    password.length > 128 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error("A valid admin email and password of 12-128 characters and no more than 72 UTF-8 bytes are required.");
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT student_id, role FROM students WHERE email = ? LIMIT 1`,
    [email]
  );
  if (existing.length) {
    if (existing[0].role !== "admin") {
      throw new Error("ADMIN_EMAIL belongs to a non-admin account; no changes were made.");
    }
    return "exists";
  }

  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO students (full_name, email, password_hash, role, email_verified)
       VALUES (?, ?, ?, 'admin', TRUE)`,
      [email.split("@")[0].slice(0, 150), email, await bcrypt.hash(password, 12)]
    );
    return "created";
  } catch (err) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT role FROM students WHERE email = ? LIMIT 1`,
      [email]
    );
    if (rows[0]?.role === "admin") return "exists";
    throw err;
  }
}
