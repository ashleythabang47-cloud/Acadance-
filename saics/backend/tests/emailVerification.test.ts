import nodemailer from "nodemailer";
import { sendVerificationCode } from "../src/services/emailVerification";

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;
const originalSmtpValues = Object.fromEntries(
  smtpKeys.map((key) => [key, process.env[key]])
) as Record<(typeof smtpKeys)[number], string | undefined>;

afterEach(() => {
  jest.clearAllMocks();
  for (const key of smtpKeys) {
    const value = originalSmtpValues[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("sendVerificationCode", () => {
  it("reports missing SMTP configuration instead of silently claiming delivery", async () => {
    for (const key of smtpKeys) delete process.env[key];
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(sendVerificationCode("student@example.com", "123456"))
        .rejects.toThrow("Missing: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.");
      expect(consoleError).toHaveBeenCalledWith(
        "Verification email delivery failed.",
        expect.objectContaining({
          message: expect.stringContaining("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM"),
        })
      );
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs SMTP delivery failures without exposing configured credentials", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "smtp-user-secret";
    process.env.SMTP_PASS = "smtp-password-secret";
    process.env.MAIL_FROM = "SAICS <no-reply@example.com>";
    const sendMail = jest.fn().mockRejectedValue(
      Object.assign(new Error("Authentication failed for smtp-user-secret smtp-password-secret"), {
        code: "EAUTH",
        command: "AUTH PLAIN",
        responseCode: 535,
      })
    );
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(sendVerificationCode("student@example.com", "123456"))
        .rejects.toThrow("Authentication failed");

      expect(consoleError).toHaveBeenCalledWith(
        "Verification email delivery failed.",
        expect.objectContaining({
          code: "EAUTH",
          command: "AUTH PLAIN",
          responseCode: 535,
        })
      );
      const loggedDetails = JSON.stringify(consoleError.mock.calls);
      expect(loggedDetails).not.toContain("smtp-user-secret");
      expect(loggedDetails).not.toContain("smtp-password-secret");
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: "student@example.com",
        subject: "Your SAICS verification code",
        text: expect.stringContaining("123456"),
      }));
    } finally {
      consoleError.mockRestore();
    }
  });
});
