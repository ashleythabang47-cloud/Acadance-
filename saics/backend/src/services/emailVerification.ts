import { createHmac, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { JWT_SECRET } from "../utils/authToken";

const EMAIL_SUBJECT = "Your SAICS verification code";

export class EmailDeliveryStatusUnknownError extends Error {
  constructor() {
    super("Email delivery status is unknown; fallback delivery was skipped to prevent duplicates.");
    this.name = "EmailDeliveryStatusUnknownError";
  }
}

export function createOtp(): string {
  const value = randomInt(0, 1_000_000);
  return String(value).padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return createHmac("sha256", JWT_SECRET).update(otp).digest("hex");
}

function reportDeliveryError(error: unknown): void {
  const record = typeof error === "object" && error !== null
    ? error as { code?: unknown; responseCode?: unknown }
    : {};
  const category = typeof record.responseCode === "number"
    ? "smtp_response_error"
    : typeof record.code === "string"
      ? "smtp_transport_error"
      : "smtp_delivery_error";
  console.error("Verification email delivery failed.", category);
}

function verificationContent(otp: string): { htmlContent: string; textContent: string } {
  const textContent =
    `Your SAICS verification code is ${otp}. It expires in 10 minutes. ` +
    "If you did not sign up for SAICS, please ignore this email.";
  return {
    htmlContent: `<p>Your SAICS verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you did not sign up for SAICS, please ignore this email.</p>`,
    textContent,
  };
}

function resolveBrevoSender(): { name: string; email: string } | null {
  const configuredFrom = process.env.MAIL_FROM?.trim() ?? "";
  const parsed = configuredFrom.match(/^(.*?)\s*<([^<>]+)>$/);
  const fallbackEmail = parsed?.[2]?.trim() || configuredFrom;
  const fallbackName = parsed?.[1]?.trim().replace(/^["']|["']$/g, "");
  const email = process.env.MAIL_FROM_EMAIL?.trim() || fallbackEmail;
  const name = process.env.MAIL_FROM_NAME?.trim() || fallbackName || "SAICS";
  if (!email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) return null;
  return { name, email };
}

type BrevoResult = "sent" | "failed" | "unknown";

async function tryBrevo(email: string, otp: string): Promise<BrevoResult | "unconfigured"> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return "unconfigured";
  const sender = resolveBrevoSender();
  if (!sender) {
    console.error("brevo-api failed: sender_not_configured");
    return "failed";
  }

  const content = verificationContent(otp);
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email }],
        subject: EMAIL_SUBJECT,
        ...content,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`brevo-api failed: status ${response.status}`);
      return response.status >= 500 ? "unknown" : "failed";
    }
    return "sent";
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    console.error(name === "TimeoutError" || name === "AbortError"
      ? "brevo-api failed: timeout; fallback skipped"
      : "brevo-api failed: network_error; fallback skipped");
    return "unknown";
  }
}

function useDevelopmentFallback(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  console.info("Development email fallback used; verification code omitted.");
  return true;
}

export async function sendVerificationCode(email: string, otp: string): Promise<void> {
  const brevoResult = await tryBrevo(email, otp);
  if (brevoResult === "sent") return;
  if (brevoResult === "unknown") throw new EmailDeliveryStatusUnknownError();

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM?.trim();
  const configured = Boolean(host && Number.isInteger(port) && port > 0 && user && password && from);

  if (!configured) {
    if (useDevelopmentFallback()) return;
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
    const content = verificationContent(otp);
    await transporter.sendMail({
      from,
      to: email,
      subject: EMAIL_SUBJECT,
      text: content.textContent,
      html: content.htmlContent,
    });
  } catch (error) {
    reportDeliveryError(error);
    if (useDevelopmentFallback()) return;
    throw error;
  }
}
