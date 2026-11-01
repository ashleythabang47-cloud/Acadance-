import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import app from "../app";
import { pool } from "../config/db";
import { StudentModel } from "../models/studentModel";
import { StreakModel } from "../models/streakModel";
import { EmailOtpModel } from "../models/emailOtpModel";
import { sendVerificationCode } from "../services/emailVerification";
import { seedAdminAccount } from "../services/adminSeed";

const mockPoolQuery = jest.fn();
const mockConnectionQuery = jest.fn();
const mockConnection = {
  query: (...args: unknown[]) => mockConnectionQuery(...args),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

jest.mock("../config/db", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    getConnection: jest.fn(),
  },
}));
jest.mock("dns", () => ({
  promises: {
    resolveMx: jest.fn().mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]),
    resolve4: jest.fn().mockResolvedValue(["192.0.2.1"]),
  },
}));
jest.mock("../models/studentModel");
jest.mock("../models/streakModel");
jest.mock("../models/notificationModel");
jest.mock("../models/quizModel");
jest.mock("../models/emailOtpModel");
jest.mock("../services/emailVerification", () => {
  const actual = jest.requireActual("../services/emailVerification");
  return { ...actual, sendVerificationCode: jest.fn().mockResolvedValue(undefined) };
});
jest.mock("../services/auditLog");

const mockedPool = pool as unknown as {
  query: typeof mockPoolQuery;
  getConnection: jest.Mock;
};
const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;
const mockedEmailOtpModel = EmailOtpModel as jest.Mocked<typeof EmailOtpModel>;
const mockedSendVerificationCode = sendVerificationCode as jest.MockedFunction<typeof sendVerificationCode>;
const jwtSecret = process.env.JWT_SECRET!;
const states = new Map<number, {
  role: "student" | "admin";
  is_suspended: boolean;
  deleted_at: Date | null;
  token_version: number;
  force_password_reset: boolean;
}>();

function authHeader(studentId: number, tokenVersion = 0) {
  const token = jwt.sign({ studentId, tokenVersion }, jwtSecret);
  return `Bearer ${token}`;
}

function mysqlRows<T>(rows: T[]) {
  return [rows, []];
}

function mockAdminState() {
  states.clear();
  states.set(10, {
    role: "admin",
    is_suspended: false,
    deleted_at: null,
    token_version: 0,
    force_password_reset: false,
  });
  mockedStudentModel.findAuthState.mockImplementation(async (id) => states.get(id) || null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminState();
  mockedStreakModel.recordActivity.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: "2026-10-28",
  });
  mockedEmailOtpModel.save.mockResolvedValue(undefined);
  mockedEmailOtpModel.delete.mockResolvedValue(undefined);
  mockedEmailOtpModel.reserveResend.mockResolvedValue(false);
  mockedSendVerificationCode.mockResolvedValue(undefined);
  mockedPool.getConnection.mockResolvedValue(mockConnection);
  mockConnectionQuery.mockReset();
  mockPoolQuery.mockReset();
  mockConnection.beginTransaction.mockResolvedValue(undefined);
  mockConnection.commit.mockResolvedValue(undefined);
  mockConnection.rollback.mockResolvedValue(undefined);
  mockConnection.release.mockImplementation(() => undefined);
});

describe("admin portal acceptance", () => {
  it("T1: returns 401 without auth and 403 for a student on any admin endpoint", async () => {
    states.set(20, { ...states.get(10)!, role: "student" });

    await request(app).get("/api/admin/dashboard").expect(401);
    await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", authHeader(20))
      .expect(403);
    await request(app)
      .get("/api/admin/nonexistent")
      .set("Authorization", authHeader(20))
      .expect(403);
  });

  it("T2: creates the bootstrap admin once and is safe to run again", async () => {
    const password = randomBytes(24).toString("base64url");
    let seeded = false;
    let inserts = 0;
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT")) {
        return mysqlRows(seeded ? [{ student_id: 1, role: "admin" }] : []);
      }
      if (sql.startsWith("INSERT")) {
        seeded = true;
        inserts += 1;
        return [{ insertId: 1 }, []];
      }
      throw new Error("Unexpected seed query.");
    });

    await expect(seedAdminAccount("root-admin@example.test", password)).resolves.toBe("created");
    await expect(seedAdminAccount("root-admin@example.test", password)).resolves.toBe("exists");
    expect(inserts).toBe(1);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["root-admin@example.test"]);
  });

  it("T3: public registration cannot set an admin role", async () => {
    mockedStudentModel.findByEmail.mockResolvedValue(null);
    mockedStudentModel.create.mockResolvedValue(71);
    const password = randomBytes(24).toString("base64url");
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "Public User",
        email: "public-user@example.test",
        password,
        confirmPassword: password,
        role: "admin",
      })
      .expect(201);
    expect(res.body.verificationRequired).toBe(true);
    expect(mockedStudentModel.create).toHaveBeenCalledWith(
      "Public User",
      "public-user@example.test",
      expect.any(String)
    );
    await request(app).post("/api/admin/users").expect(401);
  });

  it("T4: a suspended user cannot log in and existing tokens stop working", async () => {
    states.set(20, { ...states.get(10)!, role: "student" });
    mockConnectionQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 20,
          full_name: "Suspended User",
          email: "suspended@example.test",
          role: "student",
          is_suspended: false,
          deleted_at: null,
          force_password_reset: false,
        }]);
      }
      if (sql.startsWith("UPDATE students")) {
        states.set(20, {
          role: values?.[0] as "student" | "admin",
          is_suspended: values?.[1] as boolean,
          deleted_at: values?.[2] as Date | null,
          force_password_reset: values?.[3] as boolean,
          token_version: 1,
        });
      }
      return [{ affectedRows: 1, insertId: 1 }, []];
    });
    await request(app)
      .patch("/api/admin/users/20")
      .set("Authorization", authHeader(10))
      .send({ suspended: true })
      .expect(200);
    const student = {
      student_id: 20,
      full_name: "Suspended User",
      email: "suspended@example.test",
      password_hash: "unused",
      role: "student" as const,
      is_suspended: true,
      deleted_at: null,
      token_version: 1,
      force_password_reset: false,
      failed_login_attempts: 0,
      lockout_until: null,
      bio: null,
      academic_year: null,
      avatar_color: "#000000",
      avatar_url: null,
    };
    mockedStudentModel.findByEmail.mockResolvedValue(student);

    await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", authHeader(20))
      .expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({ email: student.email, password: "not-used" })
      .expect(401);
    expect(mockedStudentModel.recordFailedLogin).not.toHaveBeenCalled();
  });

  it("T5: protects the acting admin and the last active admin", async () => {
    for (const change of [{ suspended: true }, { role: "student" }, { deleted: true }]) {
      await request(app)
        .patch("/api/admin/users/10")
        .set("Authorization", authHeader(10))
        .send(change)
        .expect(400);
    }

    states.set(11, { ...states.get(10)!, role: "admin" });
    mockConnectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 10,
          role: "admin",
          is_suspended: false,
          deleted_at: null,
          force_password_reset: false,
        }]);
      }
      if (sql.includes("WHERE role = 'admin'")) return mysqlRows([{ student_id: 11 }]);
      return [{ affectedRows: 1 }, []];
    });
    for (const change of [{ suspended: true }, { role: "student" }, { deleted: true }]) {
      await request(app)
        .patch("/api/admin/users/10")
        .set("Authorization", authHeader(11))
        .send(change)
        .expect(409);
    }
  });

  it("T6: records admin actor, target and before/after values atomically", async () => {
    mockConnectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 20,
          full_name: "Student",
          email: "student@example.test",
          role: "student",
          is_suspended: false,
          deleted_at: null,
          force_password_reset: false,
        }]);
      }
      return [{ affectedRows: 1, insertId: 1 }, []];
    });

    await request(app)
      .patch("/api/admin/users/20")
      .set("Authorization", authHeader(10))
      .send({ suspended: true })
      .expect(200);
    const auditCall = mockConnectionQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audit_logs")
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toEqual([
      10,
      "user",
      "20",
      "admin.user.update",
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
    expect(JSON.parse(auditCall![1][4])).toMatchObject({ role: "student", is_suspended: false });
    expect(JSON.parse(auditCall![1][5])).toMatchObject({ role: "student", is_suspended: true });
  });

  it("T7: audit logs expose no mutation or deletion endpoint", async () => {
    await request(app)
      .patch("/api/admin/audit")
      .set("Authorization", authHeader(10))
      .send({ action: "rewrite" })
      .expect(404);
    await request(app)
      .delete("/api/admin/audit")
      .set("Authorization", authHeader(10))
      .expect(404);
  });

  it("T8: health and AI monitoring responses do not disclose configured provider values", async () => {
    const groqValue = `gsk_${randomBytes(20).toString("hex")}`;
    const geminiValue = `AIza${randomBytes(20).toString("hex")}`;
    process.env.GROQ_API_KEY = groqValue;
    process.env.GEMINI_API_KEY = geminiValue;
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql === "SELECT 1") return mysqlRows([{ ok: 1 }]);
      if (sql.includes("ai_provider_events")) return mysqlRows([]);
      return mysqlRows([]);
    });

    const [health, monitoring] = await Promise.all([
      request(app).get("/api/admin/system").set("Authorization", authHeader(10)),
      request(app).get("/api/admin/ai/monitoring").set("Authorization", authHeader(10)),
    ]);
    expect(health.status).toBe(200);
    expect(monitoring.status).toBe(200);
    const responses = JSON.stringify([health.body, monitoring.body]);
    expect(responses).not.toContain(groqValue);
    expect(responses).not.toContain(geminiValue);
    expect(responses).not.toContain("gsk_");
    expect(responses).not.toContain("AIza");
    expect(health.body.providers).toEqual({ groq: true, gemini: true, ollama: true });
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("T1: student tokens receive 403 from each new admin credential endpoint", async () => {
    states.set(20, { ...states.get(10)!, role: "student" });
    await request(app)
      .post("/api/admin/me/credentials")
      .set("Authorization", authHeader(20))
      .send({ fullName: "Student User" })
      .expect(403);
    await request(app)
      .post("/api/admin/users/10/reset-password")
      .set("Authorization", authHeader(20))
      .expect(403);
  });

  it("T2: promotes only verified active students, demotes admins and audits role changes", async () => {
    let targetRole = "student";
    let targetVerified = 1;
    mockConnectionQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 20,
          full_name: "Target User",
          email: "target@example.com",
          email_verified: targetVerified,
          role: targetRole,
          is_suspended: false,
          deleted_at: null,
          force_password_reset: false,
        }]);
      }
      if (sql.includes("WHERE role = 'admin' AND is_suspended = FALSE")) {
        return mysqlRows([{ student_id: 10 }, { student_id: 20 }]);
      }
      if (sql.startsWith("UPDATE students")) targetRole = String(values?.[0]);
      return [{ affectedRows: 1, insertId: 1 }, []];
    });

    await request(app)
      .patch("/api/admin/users/20")
      .set("Authorization", authHeader(10))
      .send({ role: "admin" })
      .expect(200);
    expect(targetRole).toBe("admin");
    const promotionAudit = mockConnectionQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audit_logs")
    );
    expect(JSON.parse(promotionAudit![1][5])).toMatchObject({ role: "admin" });

    targetVerified = 0;
    targetRole = "student";
    await request(app)
      .patch("/api/admin/users/20")
      .set("Authorization", authHeader(10))
      .send({ role: "admin" })
      .expect(409);

    targetVerified = 1;
    targetRole = "admin";
    mockConnectionQuery.mockClear();
    await request(app)
      .patch("/api/admin/users/20")
      .set("Authorization", authHeader(10))
      .send({ role: "student" })
      .expect(200);
    expect(targetRole).toBe("student");
    const auditCalls = mockConnectionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO audit_logs")
    );
    expect(auditCalls).toHaveLength(1);
    expect(JSON.parse(auditCalls[0][1][5])).toMatchObject({ role: "student" });
  });

  it("T4/T6: resets another user's password once, revokes old tokens and keeps secrets out of audit", async () => {
    mockConnectionQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 20,
          full_name: "Reset User",
          email: "reset@example.com",
          role: "student",
          is_suspended: false,
          deleted_at: null,
          force_password_reset: false,
        }]);
      }
      if (sql.includes("SET password_hash = ?")) {
        states.set(20, { ...states.get(10)!, role: "student", token_version: 1, force_password_reset: true });
      }
      return [{ affectedRows: 1, insertId: 1 }, []];
    });

    const response = await request(app)
      .post("/api/admin/users/20/reset-password")
      .set("Authorization", authHeader(10))
      .expect(200);
    expect(response.body.temporaryPassword).toEqual(expect.any(String));
    expect(response.body.user.force_password_reset).toBe(true);
    expect(response.body).not.toHaveProperty("password_hash");

    const auditCall = mockConnectionQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audit_logs")
    );
    expect(auditCall).toBeDefined();
    const auditValues = JSON.stringify(auditCall![1]);
    expect(auditValues).not.toContain(response.body.temporaryPassword);
    expect(auditValues).not.toContain("$2");
    expect(JSON.parse(auditCall![1][4])).toEqual({ force_password_reset: false });
    expect(JSON.parse(auditCall![1][5])).toEqual({ force_password_reset: true });

    await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", authHeader(20))
      .expect(401);
  });

  it("T5: rejects own credential changes with an incorrect current password", async () => {
    const passwordHash = await bcrypt.hash("Correct-Password-1!", 4);
    mockConnectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 10,
          full_name: "Admin User",
          email: "admin@example.com",
          email_verified: true,
          password_hash: passwordHash,
        }]);
      }
      return [{ affectedRows: 1 }, []];
    });

    const response = await request(app)
      .post("/api/admin/me/credentials")
      .set("Authorization", authHeader(10))
      .send({ currentPassword: "wrong-password", newPassword: "Strong-New-Password-92!", confirmPassword: "Strong-New-Password-92!" })
      .expect(401);
    expect(response.body.field).toBe("currentPassword");
    expect(mockConnectionQuery.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE students"))).toBe(false);
  });

  it("requires the current password for an email change and sends the existing OTP", async () => {
    const passwordHash = await bcrypt.hash("Correct-Password-1!", 4);
    mockConnectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WHERE student_id = ? FOR UPDATE")) {
        return mysqlRows([{
          student_id: 10,
          full_name: "Admin User",
          email: "admin@example.com",
          email_verified: true,
          password_hash: passwordHash,
        }]);
      }
      if (sql.includes("SELECT student_id FROM students WHERE LOWER(email)")) return mysqlRows([]);
      return [{ affectedRows: 1 }, []];
    });

    await request(app)
      .post("/api/admin/me/credentials")
      .set("Authorization", authHeader(10))
      .send({
        fullName: "Admin User",
        email: "new-admin@example.com",
        currentPassword: "Correct-Password-1!",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.verificationRequired).toBe(true);
        expect(body.email).toBe("new-admin@example.com");
        expect(body).not.toHaveProperty("token");
      });

    expect(mockConnectionQuery.mock.calls.some(([sql]) => String(sql).includes("email_verified = FALSE"))).toBe(true);
    expect(mockedEmailOtpModel.save).toHaveBeenCalledWith(10, expect.any(String));
    expect(mockedSendVerificationCode).toHaveBeenCalledWith("new-admin@example.com", expect.any(String));
    const auditCall = mockConnectionQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_logs"));
    expect(auditCall).toBeDefined();
    expect(JSON.stringify(auditCall![1])).not.toContain("Correct-Password-1!");
    expect(JSON.stringify(auditCall![1])).not.toContain("$2");
    expect(JSON.stringify(auditCall![1])).not.toContain(mockedSendVerificationCode.mock.calls[0][1]);
  });
});
