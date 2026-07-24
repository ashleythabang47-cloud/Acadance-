import request from "supertest";
import app from "../app";
import { StudentModel } from "../models/studentModel";
import { StreakModel } from "../models/streakModel";

jest.mock("../models/studentModel");
jest.mock("../models/streakModel");

const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedStreakModel.recordActivity.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: "2026-07-20",
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
    expect(res.body.token).toBeDefined();
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
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "real@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(mockedStreakModel.recordActivity).toHaveBeenCalledWith(7);
  });
});
