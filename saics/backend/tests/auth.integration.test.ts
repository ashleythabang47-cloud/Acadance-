import request from "supertest";
import app from "../src/app";
import { Student, StudentModel } from "../src/models/studentModel";
import { StreakModel } from "../src/models/streakModel";
import { NotificationModel } from "../src/models/notificationModel";
import { EmailOtpModel } from "../src/models/emailOtpModel";
import { sendVerificationCode } from "../src/services/emailVerification";
import { recordAudit } from "../src/services/auditLog";

jest.mock("../src/models/studentModel");
jest.mock("../src/models/streakModel");
jest.mock("../src/models/notificationModel");
jest.mock("../src/models/emailOtpModel");
jest.mock("../src/services/emailVerification", () => {
  const actual = jest.requireActual("../src/services/emailVerification");
  return { ...actual, sendVerificationCode: jest.fn().mockResolvedValue(undefined) };
});
jest.mock("../src/services/auditLog");

const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;
const mockedNotificationModel = NotificationModel as jest.Mocked<typeof NotificationModel>;
const mockedEmailOtpModel = EmailOtpModel as jest.Mocked<typeof EmailOtpModel>;
const mockedSendVerificationCode = sendVerificationCode as jest.MockedFunction<typeof sendVerificationCode>;
const mockedRecordAudit = recordAudit as jest.MockedFunction<typeof recordAudit>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedRecordAudit.mockResolvedValue(undefined);
  mockedEmailOtpModel.save.mockResolvedValue(undefined);
  mockedEmailOtpModel.delete.mockResolvedValue(undefined);
  mockedEmailOtpModel.reserveResend.mockResolvedValue(false);
  mockedSendVerificationCode.mockResolvedValue(undefined);
  mockedStudentModel.recordSuccessfulLogin.mockResolvedValue(undefined);
  mockedStudentModel.recordFailedLogin.mockResolvedValue(1);
  mockedStreakModel.recordActivity.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: "2026-07-20",
  });
  mockedStreakModel.getStreakInfo.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: null,
  });
});

describe("POST /api/auth/register", () => {
  it("rejects a request missing required fields", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "aa@bb.com" });
    expect(res.status).toBe(400);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "Test Student", email: "aa@bb.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("does not change an account when its email is already verified", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 1,
      full_name: "Existing",
      email: "aa@bb.com",
      password_hash: "hash",
      email_verified: true,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "Test Student",
        email: "aa@bb.com",
        password: "Tr0ub4dor&Horse-92",
        confirmPassword: "Tr0ub4dor&Horse-92",
      });

    expect(res.status).toBe(409);
    expect(mockedEmailOtpModel.reserveSignupResend).not.toHaveBeenCalled();
    expect(mockedSendVerificationCode).not.toHaveBeenCalled();
  });

  it("updates an unverified account and sends a replacement code on re-signup", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 42,
      full_name: "Old Name",
      email: "new@example.com",
      password_hash: "old-hash",
      email_verified: false,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });
    mockedEmailOtpModel.reserveSignupResend.mockResolvedValue(true);

    const res = await request(app).post("/api/auth/register").send({
      fullName: "Updated Student",
      email: "new@example.com",
      password: "An0ther-Strong-Pass-92",
      confirmPassword: "An0ther-Strong-Pass-92",
    });

    expect(res.status).toBe(200);
    expect(res.body.verificationRequired).toBe(true);
    expect(mockedEmailOtpModel.reserveSignupResend).toHaveBeenCalledWith(
      42,
      "Updated Student",
      expect.any(String),
      expect.any(String)
    );
    expect(mockedEmailOtpModel.save).not.toHaveBeenCalled();
    expect(mockedSendVerificationCode).toHaveBeenCalledWith("new@example.com", expect.stringMatching(/^\d{6}$/));
  });

  it("creates an unverified account and sends a code without returning a token", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue(null);
    mockedStudentModel.create.mockResolvedValue(42);

    const res = await request(app).post("/api/auth/register").send({
      fullName: "Test Student",
      email: "new@example.com",
      password: "Tr0ub4dor&Horse-92",
      confirmPassword: "Tr0ub4dor&Horse-92",
    });

    expect(res.status).toBe(201);
    expect(res.body.verificationRequired).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(mockedEmailOtpModel.save).toHaveBeenCalledTimes(1);
    const [, otpHash] = mockedEmailOtpModel.save.mock.calls[0];
    expect(otpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockedSendVerificationCode).toHaveBeenCalledTimes(1);
    expect(mockedSendVerificationCode.mock.calls[0][0]).toBe("new@example.com");
    expect(otpHash).not.toBe(mockedSendVerificationCode.mock.calls[0][1]);
    expect(res.text).not.toContain(mockedSendVerificationCode.mock.calls[0][1]);
    expect(mockedStreakModel.recordActivity).not.toHaveBeenCalled();
  });

  it("rejects a password confirmation mismatch on the server", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Test Student",
      email: "new@example.com",
      password: "Tr0ub4dor&Horse-92",
      confirmPassword: "Tr0ub4dor&Horse-93",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Passwords do not match.");
  });

  it("rejects weak passwords on the server", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Test Student",
      email: "new@example.com",
      password: "password",
      confirmPassword: "password",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Choose a stronger password.");
  });
});

describe("POST /api/auth/login", () => {
  it("rejects login for a non-existent email", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
  });

  it("rejects a wrong password for an existing account", async () => {
    // A real bcrypt hash of "correct-password", so the wrong-password
    // check below genuinely exercises bcrypt.compare rather than mocking it away.
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);

    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 7,
      full_name: "Real Student",
      email: "real@example.com",
      password_hash: realHash,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("rejects a correct password when the email is not verified", async () => {
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);
    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 7,
      full_name: "Real Student",
      email: "real@example.com",
      password_hash: realHash,
      email_verified: false,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "correct-password" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.body.token).toBeUndefined();
    expect(mockedStreakModel.recordActivity).not.toHaveBeenCalled();
  });

  it("logs in successfully with the correct password", async () => {
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);

    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 7,
      full_name: "Real Student",
      email: "real@example.com",
      password_hash: realHash,
      email_verified: true,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(mockedStreakModel.recordActivity).toHaveBeenCalledWith(7);
  });

  describe("email verification endpoints", () => {
    it("verifies an account without returning the submitted code", async () => {
      const bcrypt = require("bcrypt");
      const { createOtp } = require("../src/services/emailVerification");
      const otp = createOtp();
      const unverifiedStudent: Student = {
        student_id: 17,
        full_name: "New Student",
        email: "new@example.com",
        password_hash: await bcrypt.hash("correct-password", 10),
        email_verified: false,
        role: "student",
        is_suspended: false,
        deleted_at: null,
        token_version: 0,
        force_password_reset: false,
        failed_login_attempts: 0,
        lockout_until: null,
        bio: null,
        academic_year: null,
        avatar_color: "#0e6e66",
        avatar_url: null,
      };
      mockedStudentModel.findByEmail.mockResolvedValue(unverifiedStudent);
      mockedEmailOtpModel.verify.mockImplementation(async () => {
        unverifiedStudent.email_verified = true;
        return "verified";
      });

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ email: "new@example.com", otp });

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.text).not.toContain(otp);
      expect(mockedEmailOtpModel.verify).toHaveBeenCalledWith(17, expect.any(String));

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "new@example.com", password: "correct-password" });
      expect(login.status).toBe(200);
      expect(login.body.token).toBeDefined();
    });

    it("enforces the resend cooldown without sending another code", async () => {
      mockedStudentModel.findByEmail.mockResolvedValue({
        student_id: 17,
        full_name: "New Student",
        email: "new@example.com",
        password_hash: "hash",
        email_verified: false,
        role: "student",
        is_suspended: false,
        deleted_at: null,
        token_version: 0,
        force_password_reset: false,
        failed_login_attempts: 0,
        lockout_until: null,
        bio: null,
        academic_year: null,
        avatar_color: "#0e6e66",
        avatar_url: null,
      });
      const res = await request(app)
        .post("/api/auth/resend-otp")
        .send({ email: "new@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/If the account/);
      expect(mockedEmailOtpModel.reserveResend).toHaveBeenCalledWith(17, expect.any(String));
      expect(mockedSendVerificationCode).not.toHaveBeenCalled();
    });

    it("reports failed email delivery instead of returning a sent response", async () => {
      mockedStudentModel.findByEmail.mockResolvedValue({
        student_id: 17,
        full_name: "New Student",
        email: "new@example.com",
        password_hash: "hash",
        email_verified: false,
        role: "student",
        is_suspended: false,
        deleted_at: null,
        token_version: 0,
        force_password_reset: false,
        failed_login_attempts: 0,
        lockout_until: null,
        bio: null,
        academic_year: null,
        avatar_color: "#0e6e66",
        avatar_url: null,
      });
      mockedEmailOtpModel.reserveResend.mockResolvedValue(true);
      mockedSendVerificationCode.mockRejectedValue(new Error("SMTP unavailable"));

      const res = await request(app)
        .post("/api/auth/resend-otp")
        .send({ email: "new@example.com" });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("VERIFICATION_EMAIL_FAILED");
      expect(res.body.message).toMatch(/couldn't send/i);
      expect(mockedEmailOtpModel.delete).toHaveBeenCalledWith(17);
    });
  });

  it("sends a streak-reset reminder when the student comes back after missing more than a day", async () => {
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);

    // 3 days ago, computed relative to whenever this test actually runs —
    // avoids hardcoding a date that would eventually become stale.
    const threeDaysAgo = new Date();
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    const staleDateStr = threeDaysAgo.toISOString().slice(0, 10);

    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 7,
      full_name: "Real Student",
      email: "real@example.com",
      password_hash: realHash,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });
    mockedStreakModel.getStreakInfo.mockResolvedValue({
      current_streak: 5,
      longest_streak: 5,
      last_activity_date: staleDateStr,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(mockedNotificationModel.create).toHaveBeenCalledTimes(1);
    const [studentId, message, type] = mockedNotificationModel.create.mock.calls[0];
    expect(studentId).toBe(7);
    expect(message).toContain("5-day streak");
    expect(type).toBe("reminder");
  });

  it("does NOT send a reset reminder when the streak is still active (logged in yesterday)", async () => {
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 7,
      full_name: "Real Student",
      email: "real@example.com",
      password_hash: realHash,
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });
    mockedStreakModel.getStreakInfo.mockResolvedValue({
      current_streak: 5,
      longest_streak: 5,
      last_activity_date: yesterdayStr,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(mockedNotificationModel.create).not.toHaveBeenCalled();
  });
});
