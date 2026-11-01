import { createHmac, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { JWT_SECRET } from "../utils/authToken";

export function createOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return createHmac("sha256", JWT_SECRET).update(otp).digest("hex");
}

function reportDeliveryError(error: unknown): void {
  const record = typeof error === "object" && error !== null
    ? error as { code?: unknown; command?: unknown; responseCode?: unknown; message?: unknown }
    : {};
  let message = error instanceof Error ? error.message : "Unknown email delivery error.";
  for (const secret of [process.env.SMTP_USER, process.env.SMTP_PASS]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  message = message.replace(/(?:password|authorization|auth)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]");
  console.error("Verification email delivery failed.", {
    code: typeof record.code === "string" ? record.code : undefined,
    command: typeof record.command === "string" ? record.command : undefined,
    responseCode: typeof record.responseCode === "number" ? record.responseCode : undefined,
    message: message.slice(0, 500),
  });
}

export async function sendVerificationCode(email: string, otp: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM?.trim();
  const configured = Boolean(host && Number.isInteger(port) && port > 0 && user && password && from);

  if (!configured) {
    if (process.env.NODE_ENV === "development") {
      console.info(`Development verification code for ${email}: ${otp}`);
      return;
    }
    const missing = [
      !host && "SMTP_HOST",
      (!Number.isInteger(port) || port <= 0) && "SMTP_PORT",
      !user && "SMTP_USER",
      !password && "SMTP_PASS",
      !from && "MAIL_FROM",
    ].filter((name): name is string => Boolean(name));
    const error = new Error(`Email delivery is not configured. Missing: ${missing.join(", ")}.`);
    reportDeliveryError(error);
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });
  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: "Your SAICS verification code",
      text: `Your SAICS verification code is ${otp}. It expires in 10 minutes. If you did not sign up for SAICS, please ignore this email.`,
    });
  } catch (error) {
    reportDeliveryError(error);
    throw error;
  }
}
