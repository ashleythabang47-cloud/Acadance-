import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import { pool } from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";
import { recordAudit } from "../services/auditLog";
import { gradeLongAnswer, RubricCriterion } from "../services/grader";
import { validateEmailForAccount, validateName } from "../utils/inputValidation";
import { getPasswordStrength } from "../utils/passwordStrength";
import { EmailOtpModel } from "../models/emailOtpModel";
import { createOtp, hashOtp, sendVerificationCode } from "../services/emailVerification";
import { PerformanceModel } from "../models/performanceModel";

type AdminRequest = AuthRequest & Request;

function actorId(req: AuthRequest): number {
  return req.studentId!;
}

function pageValues(req: Request): { limit: number; offset: number } {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
  return { limit, offset: (page - 1) * limit };
}

function jsonValue(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

async function writeAudit(
  connection: PoolConnection,
  req: Request,
  event: {
    actorId: number;
    targetType: string;
    targetId?: string | number | null;
    action: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await connection.query(
    `INSERT INTO audit_logs
      (actor_id, target_type, target_id, action, before_values, after_values, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.actorId,
      event.targetType,
      event.targetId == null ? null : String(event.targetId),
      event.action,
      jsonValue(event.before),
      jsonValue(event.after),
      req.ip?.slice(0, 45) || null,
    ]
  );
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function getDashboard(_req: AdminRequest, res: Response) {
  try {
    const [[counts]] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) AS total_users,
         (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)) AS new_users_7d,
         (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)) AS new_users_30d,
         (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL AND last_login_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)) AS active_users_30d,
         (SELECT COUNT(*) FROM quizzes WHERE deleted_at IS NULL) AS total_quizzes,
         (SELECT COUNT(*) FROM quiz_questions qq JOIN quizzes q ON q.quiz_id = qq.quiz_id WHERE q.deleted_at IS NULL AND qq.deleted_at IS NULL) AS total_questions,
         (SELECT COUNT(*) FROM quiz_attempts) AS total_attempts,
         (SELECT AVG(score / NULLIF(max_score, 0) * 100) FROM quiz_attempts WHERE grading_status = 'completed' AND max_score > 0) AS average_score`
    );
    const [attemptsPerDay] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(started_at) AS day, COUNT(*) AS attempts
       FROM quiz_attempts
       WHERE started_at >= DATE_SUB(CURRENT_DATE, INTERVAL 13 DAY)
       GROUP BY DATE(started_at) ORDER BY day`
    );
    const [grading] = await pool.query<RowDataPacket[]>(
      `SELECT operation, SUM(succeeded = TRUE) AS succeeded, SUM(succeeded = FALSE) AS failed
       FROM ai_provider_events GROUP BY operation`
    );
    return res.json({ counts, attemptsPerDay, grading });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load admin dashboard." });
  }
}

export async function listUsers(req: AdminRequest, res: Response) {
  try {
    const { limit, offset } = pageValues(req);
    const filters: string[] = [req.query.status === "deleted" ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const values: (string | number)[] = [];
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      filters.push("(full_name LIKE ? OR email LIKE ?)");
      const search = `%${req.query.q.trim().slice(0, 100)}%`;
      values.push(search, search);
    }
    if (req.query.role === "student" || req.query.role === "admin") {
      filters.push("role = ?");
      values.push(req.query.role);
    }
    if (req.query.status === "suspended") filters.push("is_suspended = TRUE");
    if (req.query.status === "active") filters.push("is_suspended = FALSE");
    if (typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      filters.push("created_at >= ?");
      values.push(req.query.from);
    }
    if (typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      filters.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)");
      values.push(req.query.to);
    }
    const where = filters.join(" AND ");
    const [users] = await pool.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, email_verified, role, is_suspended, force_password_reset,
              created_at, last_login_at
       FROM students WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const [[count]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM students WHERE ${where}`,
      values
    );
    return res.json({ users, page: Math.floor(offset / limit) + 1, limit, total: Number(count.total) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load users." });
  }
}

export async function createUser(req: AdminRequest, res: Response) {
  const { fullName, email, role } = req.body ?? {};
  const nameResult = validateName(fullName);
  if (nameResult.error) return res.status(400).json(nameResult.error);
  const emailResult = await validateEmailForAccount(email);
  if (emailResult.error) return res.status(400).json(emailResult.error);
  if (role !== "student" && role !== "admin") {
    return res.status(400).json({ field: "role", message: "Choose a valid user role." });
  }
  const normalizedName = nameResult.value;
  const normalizedEmail = emailResult.value;
  const temporaryPassword = randomBytes(18).toString("base64url");
  const connection = await pool.getConnection();
  try {
    const [existing] = await connection.query<RowDataPacket[]>(
      `SELECT student_id FROM students WHERE LOWER(email) = ? LIMIT 1`,
      [normalizedEmail]
    );
    if (existing.length) return res.status(409).json({ message: "An account with this email already exists." });

    await connection.beginTransaction();
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO students (full_name, email, password_hash, role, force_password_reset)
       VALUES (?, ?, ?, ?, TRUE)`,
      [normalizedName, normalizedEmail, await bcrypt.hash(temporaryPassword, 10), role]
    );
    await writeAudit(connection, req, {
      actorId: actorId(req),
      targetType: "user",
      targetId: result.insertId,
      action: "admin.user.create",
      after: { fullName: normalizedName, email: normalizedEmail, role, forcePasswordReset: true },
    });
    await connection.commit();
    return res.status(201).json({
      message: "Account created. Share this temporary password securely; it is shown only once.",
      user: { student_id: result.insertId, full_name: normalizedName, email: normalizedEmail, role },
      temporaryPassword,
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not create account." });
  } finally {
    connection.release();
  }
}

export async function getUser(req: AdminRequest, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ field: "id", message: "Invalid user id." });
  try {
    const [users] = await pool.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, email_verified, role, is_suspended, deleted_at,
              force_password_reset, created_at, last_login_at
       FROM students WHERE student_id = ? LIMIT 1`,
      [id]
    );
    if (!users.length) return res.status(404).json({ message: "User not found." });
    const [attempts] = await pool.query<RowDataPacket[]>(
      `SELECT qa.attempt_id, q.title, qa.score, qa.max_score, qa.grading_status, qa.started_at, qa.completed_at
       FROM quiz_attempts qa JOIN quizzes q ON q.quiz_id = qa.quiz_id
       WHERE qa.student_id = ? ORDER BY qa.started_at DESC LIMIT 50`,
      [id]
    );
    const [activity] = await pool.query<RowDataPacket[]>(
      `SELECT audit_id, actor_id, target_type, target_id, action, before_values, after_values, created_at
       FROM audit_logs
       WHERE actor_id = ? OR (target_type = 'user' AND target_id = ?)
       ORDER BY created_at DESC LIMIT 100`,
      [id, String(id)]
    );
    return res.json({ user: users[0], attempts, activity });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load user profile." });
  }
}

export async function updateUser(req: AdminRequest, res: Response) {
  const id = Number(req.params.id);
  const { role, suspended, deleted, forcePasswordReset, fullName, email } = req.body ?? {};
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid user id." });
  if (forcePasswordReset !== undefined) {
    return res.status(400).json({ field: "forcePasswordReset", message: "Use the temporary-password reset action." });
  }
  let normalizedName: string | undefined;
  if (fullName !== undefined) {
    const nameResult = validateName(fullName);
    if (nameResult.error) return res.status(400).json(nameResult.error);
    normalizedName = nameResult.value;
  }
  let normalizedEmail: string | undefined;
  if (email !== undefined) {
    const emailResult = await validateEmailForAccount(email);
    if (emailResult.error) return res.status(400).json(emailResult.error);
    normalizedEmail = emailResult.value;
  }
  if (role !== undefined && role !== "admin" && role !== "student") {
    return res.status(400).json({ field: "role", message: "Choose a valid user role." });
  }
  for (const [field, value] of [["suspended", suspended], ["deleted", deleted]] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      return res.status(400).json({ field, message: "This value must be true or false." });
    }
  }
  if ([role, suspended, deleted, normalizedName, normalizedEmail].every((value) => value === undefined)) {
    return res.status(400).json({ field: "user", message: "At least one valid user field is required." });
  }
  if (id === actorId(req) && (role === "student" || suspended === true || deleted === true)) {
    return res.status(400).json({ message: "You cannot suspend, demote or delete your own account." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, email_verified, role, is_suspended, deleted_at, force_password_reset
       FROM students WHERE student_id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "User not found." });
    }
    const before = rows[0];
    if (role === "admin" && before.role === "student" &&
        (Number(before.email_verified) !== 1 || before.is_suspended || before.deleted_at)) {
      await connection.rollback();
      return res.status(409).json({ field: "role", message: "Only verified, active students can be promoted." });
    }
    if (normalizedEmail !== undefined) {
      const [duplicates] = await connection.query<RowDataPacket[]>(
        `SELECT student_id FROM students WHERE LOWER(email) = ? AND student_id <> ? LIMIT 1`,
        [normalizedEmail, id]
      );
      if (duplicates.length) {
        await connection.rollback();
        return res.status(409).json({ message: "An account with this email already exists." });
      }
    }
    const after = {
      role: role ?? before.role,
      is_suspended: suspended ?? Boolean(before.is_suspended),
      deleted_at: deleted === true ? new Date() : deleted === false ? null : before.deleted_at,
      force_password_reset: Boolean(before.force_password_reset),
      ...(normalizedName !== undefined ? { full_name: normalizedName } : {}),
      ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
      ...(normalizedEmail !== undefined && normalizedEmail !== before.email
        ? { email_verified: false }
        : { email_verified: Boolean(before.email_verified) }),
    };
    const removingAdmin =
      before.role === "admin" &&
      (after.role !== "admin" || after.is_suspended || after.deleted_at);
    if (removingAdmin) {
      const [admins] = await connection.query<RowDataPacket[]>(
        `SELECT student_id FROM students WHERE role = 'admin' AND deleted_at IS NULL FOR UPDATE`
      );
      if (admins.length <= 1) {
        await connection.rollback();
        return res.status(409).json({ message: "The last administrator cannot be demoted, suspended or deleted." });
      }
    }
    const changes: string[] = [
      "role = ?",
      "is_suspended = ?",
      "deleted_at = ?",
      "force_password_reset = ?",
    ];
    const values: unknown[] = [after.role, after.is_suspended, after.deleted_at, after.force_password_reset];
    if (normalizedName !== undefined) {
      changes.push("full_name = ?");
      values.push(normalizedName);
    }
    if (normalizedEmail !== undefined) {
      changes.push("email = ?");
      values.push(normalizedEmail);
      if (normalizedEmail !== before.email) {
        changes.push("email_verified = FALSE");
      }
    }
    await connection.query(
      `UPDATE students SET ${changes.join(", ")}, token_version = token_version + 1 WHERE student_id = ?`,
      [...values, id]
    );
    await writeAudit(connection, req, {
      actorId: actorId(req),
      targetType: "user",
      targetId: id,
      action: "admin.user.update",
      before,
      after,
    });
    await connection.commit();
    if (normalizedEmail !== undefined && normalizedEmail !== before.email) {
      const otp = createOtp();
      try {
        await EmailOtpModel.save(id, hashOtp(otp));
        await sendVerificationCode(normalizedEmail, otp);
      } catch {
        console.error("Could not deliver the changed email verification code.");
        return res.status(503).json({
          emailVerificationRequired: true,
          message: "The email was updated, but we couldn't send its verification code. Request a new code to finish verification.",
        });
      }
    }
    return res.json({ user: { ...before, ...after } });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not update user." });
  } finally {
    connection.release();
  }
}

export async function resetUserPassword(req: AdminRequest, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ field: "id", message: "Invalid user id." });
  }
  if (id === actorId(req)) {
    return res.status(400).json({ field: "id", message: "Use your own account password settings to change your password." });
  }

  const temporaryPassword = randomBytes(18).toString("base64url");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, role, is_suspended, deleted_at, force_password_reset
       FROM students WHERE student_id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length || rows[0].deleted_at) {
      await connection.rollback();
      return res.status(404).json({ message: "Active user not found." });
    }
    const before = rows[0];
    await connection.query(
      `UPDATE students
       SET password_hash = ?, force_password_reset = TRUE, token_version = token_version + 1,
           failed_login_attempts = 0, lockout_until = NULL
       WHERE student_id = ?`,
      [await bcrypt.hash(temporaryPassword, 10), id]
    );
    await writeAudit(connection, req, {
      actorId: actorId(req),
      targetType: "user",
      targetId: id,
      action: "admin.user.password.reset",
      before: { force_password_reset: Boolean(before.force_password_reset) },
      after: { force_password_reset: true },
    });
    await connection.commit();
    return res.json({
      message: "Temporary password created. It is shown only once; the user must change it at next login.",
      temporaryPassword,
      user: { student_id: id, full_name: before.full_name, email: before.email, role: before.role, force_password_reset: true },
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not reset this user's password." });
  } finally {
    connection.release();
  }
}

export async function updateOwnCredentials(req: AdminRequest, res: Response) {
  const { fullName, email, currentPassword, newPassword, confirmPassword } = req.body ?? {};
  let normalizedName: string | undefined;
  if (fullName !== undefined) {
    const nameResult = validateName(fullName);
    if (nameResult.error) return res.status(400).json(nameResult.error);
    normalizedName = nameResult.value;
  }
  let normalizedEmail: string | undefined;
  if (email !== undefined) {
    const emailResult = await validateEmailForAccount(email);
    if (emailResult.error) return res.status(400).json(emailResult.error);
    normalizedEmail = emailResult.value;
  }
  if (newPassword !== undefined && (
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    newPassword.length > 128 ||
    Buffer.byteLength(newPassword, "utf8") > 72
  )) {
    return res.status(400).json({ field: "newPassword", message: "Password must be 8-128 characters and no more than 72 UTF-8 bytes." });
  }
  if (newPassword !== undefined && typeof confirmPassword !== "string") {
    return res.status(400).json({ field: "confirmPassword", message: "Confirm your new password." });
  }
  if (newPassword !== undefined && newPassword !== confirmPassword) {
    return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });
  }
  if ([normalizedName, normalizedEmail, newPassword].every((value) => value === undefined)) {
    return res.status(400).json({ field: "credentials", message: "Provide at least one account change." });
  }
  const connection = await pool.getConnection();
  let newEmail: string | undefined;
  let emailChanged = false;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT student_id, full_name, email, email_verified, password_hash
       FROM students WHERE student_id = ? FOR UPDATE`,
      [actorId(req)]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Admin account not found." });
    }
    const before = rows[0];
    const emailRequestedChange = normalizedEmail !== undefined && normalizedEmail !== before.email;
    if ((emailRequestedChange || newPassword !== undefined) && typeof currentPassword !== "string") {
      await connection.rollback();
      return res.status(400).json({ field: "currentPassword", message: "Enter your current password to change your email or password." });
    }
    if ((emailRequestedChange || newPassword !== undefined) &&
        !(await bcrypt.compare(currentPassword as string, before.password_hash))) {
      await connection.rollback();
      return res.status(401).json({ field: "currentPassword", message: "Current password is incorrect." });
    }

    emailChanged = normalizedEmail !== undefined && normalizedEmail !== before.email;
    const nameChanged = normalizedName !== undefined && normalizedName !== before.full_name;
    const passwordChanged = newPassword !== undefined;
    if (!emailChanged && !nameChanged && !passwordChanged) {
      await connection.commit();
      return res.json({ message: "No account changes were needed.", user: { full_name: before.full_name, email: before.email } });
    }
    if (emailChanged) {
      const [duplicates] = await connection.query<RowDataPacket[]>(
        `SELECT student_id FROM students WHERE LOWER(email) = ? AND student_id <> ? LIMIT 1`,
        [normalizedEmail, actorId(req)]
      );
      if (duplicates.length) {
        await connection.rollback();
        return res.status(409).json({ field: "email", message: "An account with this email already exists." });
      }
    }
    if (passwordChanged) {
      const strength = getPasswordStrength(newPassword as string, {
        email: normalizedEmail ?? before.email,
        name: normalizedName ?? before.full_name,
      });
      if (strength.level === "weak") {
        await connection.rollback();
        return res.status(400).json({ field: "newPassword", message: "Choose a stronger password.", hints: strength.hints });
      }
      if (newPassword === currentPassword) {
        await connection.rollback();
        return res.status(400).json({ field: "newPassword", message: "Choose a password different from your current password." });
      }
    }

    const changes: string[] = [];
    const values: unknown[] = [];
    if (nameChanged) {
      changes.push("full_name = ?");
      values.push(normalizedName);
    }
    if (emailChanged) {
      changes.push("email = ?", "email_verified = FALSE");
      values.push(normalizedEmail);
      newEmail = normalizedEmail;
    }
    if (passwordChanged) {
      changes.push("password_hash = ?", "force_password_reset = FALSE", "token_version = token_version + 1");
      values.push(await bcrypt.hash(newPassword as string, 10));
    }
    await connection.query(
      `UPDATE students SET ${changes.join(", ")} WHERE student_id = ?`,
      [...values, actorId(req)]
    );
    await writeAudit(connection, req, {
      actorId: actorId(req),
      targetType: "user",
      targetId: actorId(req),
      action: "admin.credentials.update",
      before: { full_name: before.full_name, email: before.email, email_verified: Boolean(before.email_verified) },
      after: {
        ...(nameChanged ? { full_name: normalizedName } : {}),
        ...(emailChanged ? { email: normalizedEmail, email_verified: false } : {}),
        ...(passwordChanged ? { passwordChanged: true } : {}),
      },
    });
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not update your admin credentials." });
  } finally {
    connection.release();
  }

  if (emailChanged && newEmail) {
    const otp = createOtp();
    try {
      await EmailOtpModel.save(actorId(req), hashOtp(otp));
      await sendVerificationCode(newEmail, otp);
    } catch {
      return res.status(503).json({
        emailVerificationRequired: true,
        message: "Your email was updated but its verification code could not be sent. Request a new code to finish verification.",
      });
    }
  }
  return res.json({
    message: emailChanged
      ? "Account updated. Enter the verification code sent to your new email."
      : newPassword !== undefined
        ? "Password updated. Sign in again with your new password."
        : "Account updated.",
    ...(emailChanged ? { email: newEmail, verificationRequired: true } : {}),
    ...(newPassword !== undefined ? { reauthenticationRequired: true } : {}),
  });
}

export async function listAuditLogs(req: AdminRequest, res: Response) {
  try {
    const { limit, offset } = pageValues(req);
    const filters: string[] = [];
    const values: (string | number)[] = [];
    if (typeof req.query.userId === "string" && /^\d+$/.test(req.query.userId)) {
      filters.push("(actor_id = ? OR target_id = ?)");
      values.push(Number(req.query.userId), req.query.userId);
    }
    if (typeof req.query.action === "string" && req.query.action.trim()) {
      filters.push("action = ?");
      values.push(req.query.action.trim().slice(0, 100));
    }
    if (typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      filters.push("created_at >= ?");
      values.push(req.query.from);
    }
    if (typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      filters.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)");
      values.push(req.query.to);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    if (req.query.format === "csv") {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT audit_id, actor_id, target_type, target_id, action, before_values, after_values, ip_address, created_at
         FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 10000`,
        values
      );
      const columns = ["audit_id", "actor_id", "target_type", "target_id", "action", "before_values", "after_values", "ip_address", "created_at"];
      const csv = [columns.join(","), ...rows.map((row) => columns.map((col) => csvCell(row[col])).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
      return res.send(csv);
    }
    const [logs] = await pool.query<RowDataPacket[]>(
      `SELECT audit_id, actor_id, target_type, target_id, action, before_values, after_values, ip_address, created_at
       FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const [[count]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      values
    );
    return res.json({ logs, page: Math.floor(offset / limit) + 1, limit, total: Number(count.total) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load audit logs." });
  }
}

export async function listContent(req: AdminRequest, res: Response) {
  const q = typeof req.query.q === "string" ? `%${req.query.q.trim().slice(0, 100)}%` : "%";
  try {
    const [quizzes] = await pool.query<RowDataPacket[]>(
      `SELECT q.quiz_id, q.title, q.difficulty, q.is_hidden, q.deleted_at, q.created_at,
              s.subject_name, COUNT(qq.question_id) AS question_count
       FROM quizzes q JOIN subjects s ON s.subject_id = q.subject_id
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.quiz_id AND qq.deleted_at IS NULL
       WHERE q.title LIKE ? GROUP BY q.quiz_id ORDER BY q.created_at DESC LIMIT 200`,
      [q]
    );
    const [questions] = await pool.query<RowDataPacket[]>(
      `SELECT qq.question_id, qq.quiz_id, qq.question_text, qq.question_type, qq.is_hidden, qq.deleted_at, q.title
       FROM quiz_questions qq JOIN quizzes q ON q.quiz_id = qq.quiz_id
       WHERE qq.question_text LIKE ? ORDER BY qq.question_id DESC LIMIT 200`,
      [q]
    );
    const [flags] = await pool.query<RowDataPacket[]>(
      `SELECT flag_id, reporter_id, quiz_id, question_id, reason, status, created_at
       FROM content_flags WHERE status = 'open' ORDER BY created_at DESC LIMIT 200`
    );
    return res.json({ quizzes, questions, flags });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load content." });
  }
}

export async function updateQuizContent(req: AdminRequest, res: Response) {
  const id = Number(req.params.id);
  const { title, isHidden } = req.body;
  if (!Number.isInteger(id) || id < 1 || (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > 150)) || (isHidden !== undefined && typeof isHidden !== "boolean")) {
    return res.status(400).json({ message: "Invalid quiz update." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT quiz_id, title, is_hidden, deleted_at FROM quizzes WHERE quiz_id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Quiz not found." });
    }
    const before = rows[0];
    const after = {
      title: title === undefined ? before.title : title.trim(),
      is_hidden: isHidden === undefined ? Boolean(before.is_hidden) : isHidden,
      deleted_at: before.deleted_at,
    };
    await connection.query(
      `UPDATE quizzes SET title = ?, is_hidden = ? WHERE quiz_id = ?`,
      [after.title, after.is_hidden, id]
    );
    await writeAudit(connection, req, { actorId: actorId(req), targetType: "quiz", targetId: id, action: "admin.content.quiz.update", before, after });
    await connection.commit();
    return res.json({ quiz: { ...before, ...after } });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not update quiz." });
  } finally {
    connection.release();
  }
}

export async function deleteQuizContent(req: AdminRequest, res: Response) {
  return softDeleteContent(req, res, "quiz", "quizzes", "quiz_id");
}

export async function updateQuestionContent(req: AdminRequest, res: Response) {
  const id = Number(req.params.id);
  const { questionText, isHidden } = req.body;
  if (!Number.isInteger(id) || id < 1 || (questionText !== undefined && (typeof questionText !== "string" || !questionText.trim())) || (isHidden !== undefined && typeof isHidden !== "boolean")) {
    return res.status(400).json({ message: "Invalid question update." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT question_id, quiz_id, question_text, is_hidden, deleted_at FROM quiz_questions WHERE question_id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Question not found." });
    }
    const before = rows[0];
    const after = {
      question_text: questionText === undefined ? before.question_text : questionText.trim(),
      is_hidden: isHidden === undefined ? Boolean(before.is_hidden) : isHidden,
      deleted_at: before.deleted_at,
    };
    await connection.query(
      `UPDATE quiz_questions SET question_text = ?, is_hidden = ? WHERE question_id = ?`,
      [after.question_text, after.is_hidden, id]
    );
    await writeAudit(connection, req, { actorId: actorId(req), targetType: "question", targetId: id, action: "admin.content.question.update", before, after });
    await connection.commit();
    return res.json({ question: { ...before, ...after } });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not update question." });
  } finally {
    connection.release();
  }
}

export async function deleteQuestionContent(req: AdminRequest, res: Response) {
  return softDeleteContent(req, res, "question", "quiz_questions", "question_id");
}

async function softDeleteContent(
  req: AdminRequest,
  res: Response,
  type: "quiz" | "question",
  table: "quizzes" | "quiz_questions",
  idColumn: "quiz_id" | "question_id"
) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid content id." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT ${idColumn}, is_hidden, deleted_at FROM ${table} WHERE ${idColumn} = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Content not found." });
    }
    const before = rows[0];
    const after = { ...before, is_hidden: true, deleted_at: new Date() };
    await connection.query(
      `UPDATE ${table} SET is_hidden = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE ${idColumn} = ?`,
      [id]
    );
    await writeAudit(connection, req, { actorId: actorId(req), targetType: type, targetId: id, action: `admin.content.${type}.delete`, before, after });
    await connection.commit();
    return res.json({ message: "Content deleted." });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not delete content." });
  } finally {
    connection.release();
  }
}

export async function resolveContentFlag(req: AdminRequest, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid flag id." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT flag_id, status, quiz_id, question_id, reason FROM content_flags WHERE flag_id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Flag not found." });
    }
    const before = rows[0];
    await connection.query(
      `UPDATE content_flags SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE flag_id = ?`,
      [actorId(req), id]
    );
    await writeAudit(connection, req, { actorId: actorId(req), targetType: "content_flag", targetId: id, action: "admin.content.flag.resolve", before, after: { status: "resolved" } });
    await connection.commit();
    return res.json({ message: "Flag resolved." });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not resolve flag." });
  } finally {
    connection.release();
  }
}

export async function getAiMonitoring(_req: AdminRequest, res: Response) {
  try {
    const [providerStats] = await pool.query<RowDataPacket[]>(
      `SELECT provider, operation, COUNT(*) AS requests,
              SUM(succeeded = TRUE) AS succeeded, SUM(succeeded = FALSE) AS failed,
              SUM(rate_limited = TRUE) AS rate_limit_hits
       FROM ai_provider_events WHERE created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
       GROUP BY provider, operation ORDER BY provider, operation`
    );
    const [pending] = await pool.query<RowDataPacket[]>(
      `SELECT aa.answer_id, aa.attempt_id, aa.question_id, aa.student_answer, aa.max_score,
              q.question_text, q.question_type, q.model_answer, q.correct_answer, q.rubric,
              qa.student_id, s.full_name, s.email, quiz.title AS quiz_title
       FROM quiz_attempt_answers aa
       JOIN quiz_attempts qa ON qa.attempt_id = aa.attempt_id
       JOIN quiz_questions q ON q.question_id = aa.question_id
       JOIN quizzes quiz ON quiz.quiz_id = qa.quiz_id
       JOIN students s ON s.student_id = qa.student_id
       WHERE aa.grading_status = 'pending'
       ORDER BY qa.started_at ASC LIMIT 200`
    );
    return res.json({ providerStats, pending });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load AI monitoring data." });
  }
}

export async function retryPendingGrade(req: AdminRequest, res: Response) {
  const answerId = Number(req.params.id);
  if (!Number.isInteger(answerId) || answerId < 1) return res.status(400).json({ message: "Invalid answer id." });
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT aa.answer_id, aa.attempt_id, aa.question_id, aa.student_answer, aa.max_score,
              q.question_text, q.question_type, q.model_answer, q.correct_answer, q.rubric
       FROM quiz_attempt_answers aa JOIN quiz_questions q ON q.question_id = aa.question_id
       WHERE aa.answer_id = ? AND aa.grading_status = 'pending' LIMIT 1`,
      [answerId]
    );
    if (!rows.length) return res.status(404).json({ message: "Pending answer not found." });
    const row = rows[0];
    let rubric: RubricCriterion[] = [{ criterion: "Accuracy", points: 1 }];
    if (row.question_type === "long_answer" && row.rubric) {
      rubric = typeof row.rubric === "string" ? JSON.parse(row.rubric) : row.rubric;
    }
    const result = await gradeLongAnswer(
      row.question_text,
      row.model_answer || row.correct_answer || "",
      rubric,
      row.student_answer || ""
    );
    const connection = await pool.getConnection();
    let attemptGradingStatus: "pending" | "completed" = "completed";
    try {
      await connection.beginTransaction();
      const [updated] = await connection.query<ResultSetHeader>(
        `UPDATE quiz_attempt_answers
         SET score = ?, max_score = ?, is_correct = ?, feedback = ?, criterion_comments = ?, grading_status = 'completed'
         WHERE answer_id = ? AND grading_status = 'pending'`,
        [
          result.score,
          result.maxScore,
          result.score === result.maxScore,
          result.feedback,
          JSON.stringify(result.criterionComments),
          answerId,
        ]
      );
      if (!updated.affectedRows) {
        await connection.rollback();
        return res.status(409).json({ message: "This answer is already being graded or has been completed." });
      }
      const [totals] = await connection.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(score), 0) AS score, COALESCE(SUM(max_score), 0) AS max_score,
                SUM(grading_status = 'pending') AS pending
         FROM quiz_attempt_answers WHERE attempt_id = ?`,
        [row.attempt_id]
      );
      const pendingCount = Number(totals[0].pending || 0);
      attemptGradingStatus = pendingCount ? "pending" : "completed";
      await connection.query(
        `UPDATE quiz_attempts
         SET score = ?, max_score = ?, grading_status = ?, completed_at = IF(? = 0, CURRENT_TIMESTAMP, NULL)
         WHERE attempt_id = ?`,
        [
          pendingCount ? null : Number(totals[0].score),
          Number(totals[0].max_score),
          pendingCount ? "pending" : "completed",
          pendingCount,
          row.attempt_id,
        ]
      );
      await writeAudit(connection, req, {
        actorId: actorId(req),
        targetType: "quiz_attempt_answer",
        targetId: answerId,
        action: "admin.ai.retry_grading",
        before: { gradingStatus: "pending" },
        after: { gradingStatus: "completed", score: result.score, maxScore: result.maxScore },
      });
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    if (attemptGradingStatus === "completed") {
      try {
        await PerformanceModel.syncCompletedQuizAttempt(Number(row.attempt_id));
      } catch (err) {
        console.error("Quiz was graded, but its performance record could not be synchronized.", err);
        return res.status(500).json({
          message: "Quiz was graded, but its performance record could not be synchronized.",
        });
      }
    }
    return res.json({ result, attemptGradingStatus });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(500).json({ message: "The saved grading rubric is invalid." });
    console.error(err);
    return res.status(502).json({ message: "Could not retry grading. The answer remains pending." });
  }
}

export async function getSystemHealth(_req: AdminRequest, res: Response) {
  let database = "unavailable";
  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch {
    database = "unavailable";
  }
  try {
    const [recentErrors] = await pool.query<RowDataPacket[]>(
      `SELECT provider, operation, error_message, created_at
       FROM ai_provider_events WHERE succeeded = FALSE
       ORDER BY created_at DESC LIMIT 25`
    );
    return res.json({
      database,
      providers: {
        groq: Boolean(process.env.GROQ_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        ollama: true,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      recentErrors,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      database,
      providers: {
        groq: Boolean(process.env.GROQ_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        ollama: true,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      recentErrors: [],
    });
  }
}

export async function postAnnouncement(req: AdminRequest, res: Response) {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim() || message.trim().length > 1000) {
    return res.status(400).json({ message: "Announcement must be 1-1000 characters." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO announcements (admin_id, message) VALUES (?, ?)`,
      [actorId(req), message.trim()]
    );
    await writeAudit(connection, req, {
      actorId: actorId(req),
      targetType: "announcement",
      targetId: result.insertId,
      action: "admin.announcement.create",
      after: { message: message.trim() },
    });
    await connection.commit();
    return res.status(201).json({ announcement: { announcement_id: result.insertId, message: message.trim() } });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: "Could not publish announcement." });
  } finally {
    connection.release();
  }
}

export async function listAdminAnnouncements(_req: AdminRequest, res: Response) {
  try {
    const [announcements] = await pool.query<RowDataPacket[]>(
      `SELECT announcement_id, message, created_at FROM announcements ORDER BY created_at DESC LIMIT 100`
    );
    return res.json({ announcements });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load announcements." });
  }
}

export async function listAnnouncements(_req: Request, res: Response) {
  try {
    const [announcements] = await pool.query<RowDataPacket[]>(
      `SELECT announcement_id, message, created_at FROM announcements ORDER BY created_at DESC LIMIT 20`
    );
    return res.json({ announcements });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load announcements." });
  }
}

export async function reportContentFlag(req: AuthRequest, res: Response) {
  const quizId = Number(req.params.id);
  const questionId = req.body?.questionId == null ? null : Number(req.body.questionId);
  const reason = req.body?.reason;
  if (
    !Number.isInteger(quizId) ||
    quizId < 1 ||
    (questionId !== null && (!Number.isInteger(questionId) || questionId < 1)) ||
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > 1000
  ) {
    return res.status(400).json({ message: "A valid reason and optional question id are required." });
  }
  try {
    if (questionId !== null) {
      const [questions] = await pool.query<RowDataPacket[]>(
        `SELECT question_id FROM quiz_questions WHERE question_id = ? AND quiz_id = ? AND deleted_at IS NULL`,
        [questionId, quizId]
      );
      if (!questions.length) return res.status(404).json({ message: "Question not found in this quiz." });
    }
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO content_flags (reporter_id, quiz_id, question_id, reason) VALUES (?, ?, ?, ?)`,
      [req.studentId!, quizId, questionId, reason.trim()]
    );
    await recordAudit({
      actorId: req.studentId,
      targetType: "content_flag",
      targetId: result.insertId,
      action: "content.flag.create",
      after: { quizId, questionId, reason: reason.trim() },
      ipAddress: req.ip,
    });
    return res.status(201).json({ message: "Content reported for review." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not report content." });
  }
}
