import request from "supertest";
import app from "../app";
import { StudentModel } from "../models/studentModel";
import { StreakModel } from "../models/streakModel";
import { NotificationModel } from "../models/notificationModel";

jest.mock("../models/studentModel");
jest.mock("../models/streakModel");
jest.mock("../models/notificationModel");

const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;
const mockedNotificationModel = NotificationModel as jest.Mocked<typeof NotificationModel>;

beforeEach(() => {
  jest.clearAllMocks();
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
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "Test Student", email: "a@b.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects registering with an email that's already taken", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 1,
      full_name: "Existing",
      email: "a@b.com",
      password_hash: "hash",
      role: "student",
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "Test Student", email: "a@b.com", password: "password123" });

    expect(res.status).toBe(409);
  });

  it("creates a new account and returns a token", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue(null);
    mockedStudentModel.create.mockResolvedValue(42);

    const res = await request(app).post("/api/auth/register").send({
      fullName: "Test Student",
      email: "new@example.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^token=/);
    expect(res.body.student.studentId).toBe(42);
    expect(mockedStreakModel.recordActivity).toHaveBeenCalledWith(42);
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

  it("logs in successfully with the correct password", async () => {
    const bcrypt = require("bcrypt");
    const realHash = await bcrypt.hash("correct-password", 10);

    mockedStudentModel.findByEmail.mockResolvedValue({
      student_id: 7,
      full_name: "Real Student",
      email: "real@example.com",
      password_hash: realHash,
      role: "student",
      bio: null,
      academic_year: null,
      avatar_color: "#0e6e66",
      avatar_url: null,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^token=/);
    expect(mockedStreakModel.recordActivity).toHaveBeenCalledWith(7);
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
