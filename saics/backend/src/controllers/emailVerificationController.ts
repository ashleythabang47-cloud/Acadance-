import { Request, Response } from "express";
import { StudentModel } from "../models/studentModel";
import { EmailOtpModel } from "../models/emailOtpModel";
import {
  createOtp,
  EmailDeliveryStatusUnknownError,
  hashOtp,
  sendVerificationCode,
} from "../services/emailVerification";
import { recordAudit } from "../services/auditLog";

const RESEND_RESPONSE = "If the account needs verification and can receive another code, a code has been sent.";
const INVALID_CODE_RESPONSE = "The verification code is invalid or expired.";
const DELIVERY_FAILED_RESPONSE = "We couldn't send your verification code. Check the email server configuration and try again.";
type VerificationFailureReason =
  | "no-active-otp"
  | "expired"
  | "hash-mismatch"
  | "attempts-exceeded"
  | "email-not-found";

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeOtp(otp: unknown): string | null {
  if (typeof otp !== "string") return null;
  return otp.replace(/\s/g, "");
}

function logVerificationFailure(reason: VerificationFailureReason): void {
  console.info("Email OTP verification failed.", reason);
}

export async function verifyOtp(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email);
  const otp = normalizeOtp(req.body?.otp);
  try {
    if (!email || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      const reason = email ? "hash-mismatch" : "email-not-found";
      logVerificationFailure(reason);
      await recordAudit({
        targetType: "user",
        targetId: email,
        action: "otp_failed",
        after: { reason },
        ipAddress: req.ip,
      });
      return res.status(400).json({ message: INVALID_CODE_RESPONSE });
    }

    const student = await StudentModel.findByEmail(email);
    if (!student || student.deleted_at || student.email_verified) {
      const reason = student ? "no-active-otp" : "email-not-found";
      logVerificationFailure(reason);
      await recordAudit({
        actorId: student?.student_id,
        targetType: "user",
        targetId: student?.student_id ?? email,
        action: "otp_failed",
        after: { reason },
        ipAddress: req.ip,
      });
      return res.status(400).json({ message: INVALID_CODE_RESPONSE });
    }

    const result = await EmailOtpModel.verify(student.student_id, hashOtp(otp));
    if (result !== "verified") {
      logVerificationFailure(result);
      await recordAudit({
        actorId: student.student_id,
        targetType: "user",
        targetId: student.student_id,
        action: "otp_failed",
        after: { reason: result },
        ipAddress: req.ip,
      });
      return res.status(400).json({ message: INVALID_CODE_RESPONSE });
    }

    await recordAudit({
      actorId: student.student_id,
      targetType: "user",
      targetId: student.student_id,
      action: "otp_verified",
      ipAddress: req.ip,
    });
    return res.status(200).json({ message: "Email verified. You can now log in.", verified: true });
  } catch (error) {
    console.error("Email OTP verification failed: internal_error");
    return res.status(500).json({ message: "Could not verify the code. Please try again." });
  }
}

export async function resendOtp(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(200).json({ message: RESEND_RESPONSE });

  try {
    const student = await StudentModel.findByEmail(email);
    if (!student || student.deleted_at || student.email_verified) {
      return res.status(200).json({ message: RESEND_RESPONSE });
    }

    const otp = createOtp();
    const reserved = await EmailOtpModel.reserveResend(student.student_id, hashOtp(otp));
    if (!reserved) return res.status(200).json({ message: RESEND_RESPONSE });

    try {
      await sendVerificationCode(email, otp);
    } catch (error) {
      const deliveryStatusUnknown = error instanceof EmailDeliveryStatusUnknownError;
      if (!deliveryStatusUnknown) await EmailOtpModel.delete(student.student_id);
      await recordAudit({
        actorId: student.student_id,
        targetType: "user",
        targetId: student.student_id,
        action: "otp_failed",
        after: {
          reason: deliveryStatusUnknown ? "delivery_status_unknown" : "delivery_failed",
          source: "resend",
        },
        ipAddress: req.ip,
      });
      return res.status(503).json({
        code: "VERIFICATION_EMAIL_FAILED",
        message: DELIVERY_FAILED_RESPONSE,
      });
    }

    await recordAudit({
      actorId: student.student_id,
      targetType: "user",
      targetId: student.student_id,
      action: "otp_sent",
      after: { source: "resend" },
      ipAddress: req.ip,
    });
    return res.status(200).json({ message: RESEND_RESPONSE });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "We couldn't process the resend request. Please try again." });
  }
}
