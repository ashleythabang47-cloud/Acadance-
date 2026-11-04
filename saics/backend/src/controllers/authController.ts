import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { StudentModel } from "../models/studentModel";
import { StreakModel } from "../models/streakModel";
import { NotificationModel } from "../models/notificationModel";
import { toDateString, daysBetween } from "../utils/streakLogic";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../utils/authToken";
import { getPasswordStrength } from "../utils/passwordStrength";
import { validateEmail, validateEmailForAccount, validateName } from "../utils/inputValidation";
import { EmailOtpModel } from "../models/emailOtpModel";
import {
  createOtp,
  EmailDeliveryStatusUnknownError,
  hashOtp,
  sendVerificationCode,
} from "../services/emailVerification";
import { recordAudit } from "../services/auditLog";

export async function register(req: Request, res: Response) {
  try {
    const { fullName, email, password, confirmPassword } = req.body ?? {};
    const nameResult = validateName(fullName);
    if (nameResult.error) return res.status(400).json(nameResult.error);
    const emailResult = validateEmail(email);
    if (emailResult.error) return res.status(400).json(emailResult.error);
    if (typeof password !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({ field: "password", message: "Password and password confirmation are required." });
    }
    if (password.length < 8 || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ field: "password", message: "Password must be 8-128 characters and no more than 72 UTF-8 bytes." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });
    }

    const normalizedEmail = emailResult.value;
    const normalizedName = nameResult.value;
    const passwordStrength = getPasswordStrength(password, { email: normalizedEmail, name: normalizedName });
    if (passwordStrength.level === "weak") {
      return res.status(400).json({ field: "password", message: "Choose a stronger password.", hints: passwordStrength.hints });
    }
    const existing = await StudentModel.findByEmail(normalizedEmail);
    if (existing) {
      if (Number(existing.email_verified) === 0) {
        const passwordHash = await bcrypt.hash(password, 10);
        const otp = createOtp();
        const reserved = await EmailOtpModel.reserveSignupResend(
          existing.student_id,
          normalizedName,
          passwordHash,
          hashOtp(otp)
        );
        if (!reserved) {
          return res.status(200).json({
            message: "If the account needs verification and can receive another code, a code has been sent.",
          });
        }

        try {
          await sendVerificationCode(normalizedEmail, otp);
        } catch (error) {
          const deliveryStatusUnknown = error instanceof EmailDeliveryStatusUnknownError;
          if (!deliveryStatusUnknown) await EmailOtpModel.delete(existing.student_id);
          await recordAudit({
            actorId: existing.student_id,
            targetType: "user",
            targetId: existing.student_id,
            action: "otp_failed",
            after: {
              reason: deliveryStatusUnknown ? "delivery_status_unknown" : "delivery_failed",
              source: "resend",
            },
            ipAddress: req.ip,
          });
          return res.status(503).json({
            code: "VERIFICATION_EMAIL_FAILED",
            emailVerificationRequired: true,
            message: "We couldn't send your verification code. Check the email server configuration and try again.",
          });
        }

        await recordAudit({
          actorId: existing.student_id,
          targetType: "user",
          targetId: existing.student_id,
          action: "otp_sent",
          after: { source: "resend" },
          ipAddress: req.ip,
        });
        return res.status(200).json({
          message: "Account updated. Enter the verification code sent to your email.",
          email: normalizedEmail,
          verificationRequired: true,
        });
      }
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const domainResult = await validateEmailForAccount(emailResult.value);
    if (domainResult.error) return res.status(400).json(domainResult.error);

    const passwordHash = await bcrypt.hash(password, 10);
    const studentId = await StudentModel.create(normalizedName, normalizedEmail, passwordHash);
    const otp = createOtp();
    await EmailOtpModel.save(studentId, hashOtp(otp));
    await recordAudit({
      actorId: studentId,
      targetType: "user",
      targetId: studentId,
      action: "user.signup",
      after: { role: "student", email: normalizedEmail },
      ipAddress: req.ip,
    });

    try {
      await sendVerificationCode(normalizedEmail, otp);
      await recordAudit({
        actorId: studentId,
        targetType: "user",
        targetId: studentId,
        action: "otp_sent",
        after: { source: "signup" },
        ipAddress: req.ip,
      });
    } catch (error) {
      const deliveryStatusUnknown = error instanceof EmailDeliveryStatusUnknownError;
      if (!deliveryStatusUnknown) await EmailOtpModel.delete(studentId);
      await recordAudit({
        actorId: studentId,
        targetType: "user",
        targetId: studentId,
        action: "otp_failed",
        after: { reason: deliveryStatusUnknown ? "delivery_status_unknown" : "delivery_failed" },
        ipAddress: req.ip,
      });
      return res.status(503).json({
        code: "VERIFICATION_EMAIL_FAILED",
        emailVerificationRequired: true,
        message: "Your account was created, but the verification email could not be sent. Please try resending the code.",
      });
    }

    return res.status(201).json({
      message: "Account created. Enter the verification code sent to your email.",
      email: normalizedEmail,
      verificationRequired: true,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error during registration." });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      await recordAudit({
        targetType: "user",
        targetId: typeof email === "string" ? email.trim().toLowerCase() : null,
        action: "auth.login.failure",
        after: { reason: "invalid_credentials" },
        ipAddress: req.ip,
      });
      return res.status(400).json({ message: "Email and password are required." });
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must be no more than 72 UTF-8 bytes." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const student = await StudentModel.findByEmail(normalizedEmail);
    if (!student || student.deleted_at || student.is_suspended) {
      await recordAudit({
        actorId: student?.student_id,
        targetType: "user",
        targetId: student?.student_id ?? normalizedEmail,
        action: "auth.login.failure",
        after: { reason: student?.is_suspended ? "suspended" : "invalid_credentials" },
        ipAddress: req.ip,
      });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (student.lockout_until && new Date(student.lockout_until).getTime() > Date.now()) {
      await recordAudit({
        actorId: student.student_id,
        targetType: "user",
        targetId: student.student_id,
        action: "auth.login.failure",
        after: { reason: "locked_out" },
        ipAddress: req.ip,
      });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, student.password_hash);
    if (!isMatch) {
      const failures = await StudentModel.recordFailedLogin(student.student_id);
      await recordAudit({
        actorId: student.student_id,
        targetType: "user",
        targetId: student.student_id,
        action: "auth.login.failure",
        after: { reason: "invalid_credentials", failedAttempts: failures },
        ipAddress: req.ip,
      });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (student.email_verified === false || Number(student.email_verified) === 0) {
      await recordAudit({
        actorId: student.student_id,
        targetType: "user",
        targetId: student.student_id,
        action: "auth.login.failure",
        after: { reason: "email_not_verified" },
        ipAddress: req.ip,
      });
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before logging in.",
      });
    }

    await StudentModel.recordSuccessfulLogin(student.student_id);
    const token = jwt.sign(
      {
        studentId: student.student_id,
        email: student.email,
        tokenVersion: Number(student.token_version || 0),
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    await recordAudit({
      actorId: student.student_id,
      targetType: "user",
      targetId: student.student_id,
      action: "auth.login.success",
      after: { role: student.role },
      ipAddress: req.ip,
    });

    // Check for a lapsed streak BEFORE today's login counts as new activity —
    // only worth telling someone their streak broke if they actually had
    // one going (a first-ever login shouldn't trigger this).
    const beforeLogin = await StreakModel.getStreakInfo(student.student_id);
    if (beforeLogin.last_activity_date) {
      const today = toDateString(new Date());
      const gap = daysBetween(beforeLogin.last_activity_date, today);
      if (gap > 1 && beforeLogin.current_streak > 1) {
        await NotificationModel.create(
          student.student_id,
          `Your ${beforeLogin.current_streak}-day streak reset after a break — no worries, today's a fresh start.`,
          "reminder"
        );
      }
    }

    // Logging in counts as daily activity for streak purposes.
    await StreakModel.recordActivity(student.student_id);

    return res.status(200).json({
      message: "Login successful.",
      token,
      student: {
        studentId: student.student_id,
        fullName: student.full_name,
        email: student.email,
        role: student.role,
        avatarColor: student.avatar_color,
        avatarUrl: student.avatar_url,
        forcePasswordReset: student.force_password_reset,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error during login." });
  }
}

export async function changePassword(req: Request & { studentId?: number }, res: Response) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      newPassword.length < 8 ||
      newPassword.length > 128 ||
      Buffer.byteLength(currentPassword, "utf8") > 72 ||
      Buffer.byteLength(newPassword, "utf8") > 72
    ) {
      return res.status(400).json({ message: "A current password and new password of 8-128 characters and no more than 72 UTF-8 bytes are required." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }
    const student = await StudentModel.findByIdForLogin(req.studentId!);
    const strength = getPasswordStrength(newPassword, { email: student?.email, name: student?.full_name });
    if (strength.level === "weak") {
      return res.status(400).json({ message: "Choose a stronger password.", hints: strength.hints });
    }
    if (!student || !(await bcrypt.compare(currentPassword, student.password_hash))) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }
    await StudentModel.updatePassword(student.student_id, await bcrypt.hash(newPassword, 10));
    const token = jwt.sign(
      {
        studentId: student.student_id,
        email: student.email,
        tokenVersion: Number(student.token_version || 0) + 1,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    await recordAudit({
      actorId: student.student_id,
      targetType: "user",
      targetId: student.student_id,
      action: "auth.password.change",
      after: { forcePasswordReset: false },
      ipAddress: req.ip,
    });
    return res.status(200).json({ message: "Password updated.", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not update password." });
  }
}
