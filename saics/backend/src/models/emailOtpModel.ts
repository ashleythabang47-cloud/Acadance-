import { timingSafeEqual } from "node:crypto";
import { RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import { pool } from "../config/db";

type VerificationResult = "verified" | "invalid" | "expired";

interface OtpRow extends RowDataPacket {
  otp_hash: string;
  expires_at: Date;
  attempts: number;
}

async function canReserveResend(connection: PoolConnection, studentId: number): Promise<boolean> {
  const [otpRows] = await connection.query<RowDataPacket[]>(
    `SELECT TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP) AS seconds_since_created
     FROM email_otps WHERE student_id = ? LIMIT 1`,
    [studentId]
  );
  const [auditRows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS send_count FROM audit_logs
     WHERE action IN ('otp_sent', 'otp_failed') AND target_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(after_values, '$.source')) = 'resend'
       AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)`,
    [String(studentId)]
  );
  const secondsSinceCreated = otpRows[0]?.seconds_since_created;
  return !(
    (secondsSinceCreated !== undefined && Number(secondsSinceCreated) < 60)
    || Number(auditRows[0]?.send_count ?? 0) >= 5
  );
}

async function replaceOtp(
  connection: PoolConnection,
  studentId: number,
  otpHash: string
): Promise<void> {
  await connection.query(
    `INSERT INTO email_otps (student_id, otp_hash, expires_at, attempts, created_at)
     VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 0, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE otp_hash = VALUES(otp_hash),
       expires_at = VALUES(expires_at), attempts = 0, created_at = CURRENT_TIMESTAMP`,
    [studentId, otpHash]
  );
}

export const EmailOtpModel = {
  async save(studentId: number, otpHash: string): Promise<void> {
    await pool.query(
      `INSERT INTO email_otps (student_id, otp_hash, expires_at, attempts, created_at)
       VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 0, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE otp_hash = VALUES(otp_hash),
         expires_at = VALUES(expires_at), attempts = 0, created_at = CURRENT_TIMESTAMP`,
      [studentId, otpHash]
    );
  },

  async delete(studentId: number): Promise<void> {
    await pool.query(`DELETE FROM email_otps WHERE student_id = ?`, [studentId]);
  },

  async reserveResend(studentId: number, otpHash: string): Promise<boolean> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [studentRows] = await connection.query<RowDataPacket[]>(
        `SELECT student_id FROM students
         WHERE student_id = ? AND email_verified = FALSE AND deleted_at IS NULL FOR UPDATE`,
        [studentId]
      );
      if (!studentRows[0]) {
        await connection.commit();
        return false;
      }

      if (!await canReserveResend(connection, studentId)) {
        await connection.commit();
        return false;
      }

      await replaceOtp(connection, studentId, otpHash);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async reserveSignupResend(
    studentId: number,
    fullName: string,
    passwordHash: string,
    otpHash: string
  ): Promise<boolean> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [studentRows] = await connection.query<RowDataPacket[]>(
        `SELECT student_id FROM students
         WHERE student_id = ? AND email_verified = FALSE AND role = 'student' FOR UPDATE`,
        [studentId]
      );
      if (!studentRows[0] || !await canReserveResend(connection, studentId)) {
        await connection.commit();
        return false;
      }

      await connection.query(
        `UPDATE students SET full_name = ?, password_hash = ?
         WHERE student_id = ? AND email_verified = FALSE AND role = 'student'`,
        [fullName, passwordHash, studentId]
      );
      await replaceOtp(connection, studentId, otpHash);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async verify(studentId: number, submittedHash: string): Promise<VerificationResult> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<OtpRow[]>(
        `SELECT otp_hash, expires_at, attempts FROM email_otps
         WHERE student_id = ? FOR UPDATE`,
        [studentId]
      );
      const otp = rows[0];
      if (!otp) {
        await connection.commit();
        return "invalid";
      }

      if (new Date(otp.expires_at).getTime() <= Date.now()) {
        await connection.query(`DELETE FROM email_otps WHERE student_id = ?`, [studentId]);
        await connection.commit();
        return "expired";
      }

      const storedHash = Buffer.from(otp.otp_hash, "hex");
      const candidateHash = Buffer.from(submittedHash, "hex");
      const matches = storedHash.length === 32
        && candidateHash.length === 32
        && timingSafeEqual(storedHash, candidateHash);

      if (!matches) {
        const nextAttempts = Number(otp.attempts) + 1;
        if (nextAttempts >= 5) {
          await connection.query(`DELETE FROM email_otps WHERE student_id = ?`, [studentId]);
        } else {
          await connection.query(
            `UPDATE email_otps SET attempts = ? WHERE student_id = ?`,
            [nextAttempts, studentId]
          );
        }
        await connection.commit();
        return "invalid";
      }

      await connection.query(
        `UPDATE students SET email_verified = TRUE WHERE student_id = ?`,
        [studentId]
      );
      await connection.query(`DELETE FROM email_otps WHERE student_id = ?`, [studentId]);
      await connection.commit();
      return "verified";
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

};
