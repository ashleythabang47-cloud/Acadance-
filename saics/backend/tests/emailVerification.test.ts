import nodemailer from "nodemailer";
import { sendVerificationCode } from "../src/services/emailVerification";

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;
const brevoKeys = ["BREVO_API_KEY", "MAIL_FROM_NAME", "MAIL_FROM_EMAIL"] as const;
const originalSmtpValues = Object.fromEntries(
  smtpKeys.map((key) => [key, process.env[key]])
) as Record<(typeof smtpKeys)[number], string | undefined>;
const originalBrevoValues = Object.fromEntries(
  brevoKeys.map((key) => [key, process.env[key]])
) as Record<(typeof brevoKeys)[number], string | undefined>;
const originalFetch = global.fetch;
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  for (const key of brevoKeys) delete process.env[key];
});

afterEach(() => {
  jest.clearAllMocks();
  for (const key of smtpKeys) {
    const value = originalSmtpValues[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const key of brevoKeys) {
    const value = originalBrevoValues[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = originalFetch;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
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
        "smtp_delivery_error"
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

      expect(consoleError).toHaveBeenCalledWith("Verification email delivery failed.", "smtp_response_error");
      const loggedDetails = JSON.stringify(consoleError.mock.calls);
      expect(loggedDetails).not.toContain("smtp-user-secret");
      expect(loggedDetails).not.toContain("smtp-password-secret");
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: "student@example.com",
        subject: "Your SAICS verification code",
        text: expect.stringContaining("123456"),
        html: expect.stringContaining("123456"),
      }));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses Brevo HTTPS transport when configured", async () => {
    process.env.BREVO_API_KEY = "brevo-api-secret";
    process.env.MAIL_FROM = "Acadance <verify@example.com>";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 } as Response);

    await expect(sendVerificationCode("student@example.com", "123456")).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["api-key"]).toBe("brevo-api-secret");
    expect(options.signal).toBeDefined();
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({
      sender: { name: "Acadance", email: "verify@example.com" },
      to: [{ email: "student@example.com" }],
      subject: "Your SAICS verification code",
      textContent: expect.stringContaining("123456"),
      htmlContent: expect.stringContaining("123456"),
    });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("falls back to SMTP on Brevo 401 without logging the key, OTP, or body", async () => {
    process.env.BREVO_API_KEY = "brevo-api-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-password";
    process.env.MAIL_FROM = "SAICS <no-reply@example.com>";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(sendVerificationCode("student@example.com", "123456")).resolves.toBeUndefined();

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith("brevo-api failed: status 401");
      const loggedDetails = JSON.stringify(consoleError.mock.calls);
      expect(loggedDetails).not.toContain("brevo-api-secret");
      expect(loggedDetails).not.toContain("123456");
      expect(loggedDetails).not.toContain("Your SAICS verification code");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not risk duplicate delivery when the Brevo request times out", async () => {
    process.env.BREVO_API_KEY = "brevo-api-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-password";
    process.env.MAIL_FROM = "SAICS <no-reply@example.com>";
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error("request timed out"), { name: "TimeoutError" })
    );
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(sendVerificationCode("student@example.com", "123456"))
        .rejects.toThrow("delivery status is unknown");

      expect(sendMail).not.toHaveBeenCalled();
      const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(options.signal).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith("brevo-api failed: timeout; fallback skipped");
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("brevo-api-secret");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to development logging without emitting the verification code", async () => {
    process.env.NODE_ENV = "development";
    process.env.BREVO_API_KEY = "brevo-api-secret";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.MAIL_FROM;
    global.fetch = jest.fn().mockRejectedValue(new Error("private provider details"));
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(sendVerificationCode("student@example.com", "123456")).resolves.toBeUndefined();
      expect(consoleInfo).toHaveBeenCalledWith(
        "Development email fallback used; verification code omitted."
      );
      const logs = JSON.stringify([consoleInfo.mock.calls, consoleError.mock.calls]);
      expect(logs).not.toContain("123456");
      expect(logs).not.toContain("brevo-api-secret");
      expect(logs).not.toContain("private provider details");
    } finally {
      consoleInfo.mockRestore();
      consoleError.mockRestore();
    }
  });
});
