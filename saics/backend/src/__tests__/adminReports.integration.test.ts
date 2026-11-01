import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import { pool } from "../config/db";
import { StudentModel } from "../models/studentModel";
import { RiskAnalysisModel } from "../models/riskAnalysisModel";
import { AdminReportModel } from "../models/adminReportModel";

jest.mock("../config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../models/studentModel");
jest.mock("../models/riskAnalysisModel");
jest.mock("../models/adminReportModel");

const mockedPoolQuery = jest.mocked(pool.query);
const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedRiskAnalysisModel = RiskAnalysisModel as jest.Mocked<typeof RiskAnalysisModel>;
const mockedAdminReportModel = AdminReportModel as jest.Mocked<typeof AdminReportModel>;
const adminToken = jwt.sign({ studentId: 7, tokenVersion: 0 }, process.env.JWT_SECRET!);
const studentToken = jwt.sign({ studentId: 8, tokenVersion: 0 }, process.env.JWT_SECRET!);
const range = { from: "2026-10-01", to: "2026-10-31" };

function rows<T extends Record<string, unknown>>(value: T[]) {
  return [value, []] as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedStudentModel.findAuthState.mockImplementation(async (studentId) => ({
    role: studentId === 7 ? "admin" : "student",
    is_suspended: false,
    deleted_at: null,
    token_version: 0,
    force_password_reset: false,
  }));
  mockedPoolQuery.mockImplementation(async (sql) => {
    const text = String(sql);
    if (text.includes("INSERT INTO audit_logs")) return [{ insertId: 1 }, []] as never;
    if (text.includes("SELECT full_name FROM students WHERE student_id")) return rows([{ full_name: "Report Admin" }]);
    return rows([]);
  });
  mockedAdminReportModel.userActivity.mockResolvedValue({
    title: "User activity",
    summary: { signups: 10, verified: 8, unverified: 2, active_users: 6, suspensions: 1, role_changes: 2 },
    sections: [{ title: "Signups by day", columns: ["day", "signups"], rows: [{ day: "2026-10-02", signups: 3 } as never] }],
    total: 1,
  });
  mockedAdminReportModel.academicPerformance.mockResolvedValue({
    title: "Academic performance",
    summary: { records: 4, average_score: 75 },
    sections: [{ title: "Average by subject", columns: ["subject_name", "records"], rows: [{ subject_name: "Science", records: 4 } as never] }],
    total: 1,
  });
  mockedAdminReportModel.quiz.mockResolvedValue({
    title: "Quiz report",
    summary: { quizzes_taken: 5, pending_grading: 1, average_score: 80, pass_rate: 75 },
    sections: [{ title: "Attempts by quiz", columns: ["title", "attempts"], rows: [{ title: "Quiz A", attempts: 5 } as never] }],
    total: 1,
  });
  mockedAdminReportModel.aiUsage.mockResolvedValue({
    title: "AI usage",
    summary: { requests: 4, succeeded: 3, failed: 1, rate_limited: 1 },
    sections: [{ title: "Requests per provider and day", columns: ["provider", "requests"], rows: [{ provider: "groq", requests: 4 } as never] }],
    total: 1,
  });
  mockedAdminReportModel.auditSummary.mockResolvedValue({
    title: "Audit summary",
    summary: { total_actions: 2 },
    sections: [{ title: "Actions by type", columns: ["action", "actions"], rows: [{ action: "admin.user.update", actions: 2 } as never] }],
    total: 1,
  });
  mockedRiskAnalysisModel.findAllStudents.mockResolvedValue([{
    studentId: 22,
    fullName: "=HYPERLINK(\"https://example.test\",\"Student\")",
    email: "student@example.test",
    input: {
      performanceRecords: [80, 75, 70].map((score, index) => ({
        score,
        max_score: 100,
        date: `2026-10-0${index + 1}`,
        subject: "Science",
        subjectId: 2,
      })),
      quizAttemptScores: [],
      lastActivityDate: "2026-10-29",
      currentStreak: 1,
      asOfDate: "2026-10-31",
    },
  }]);
});

describe("admin reports", () => {
  it("T1: requires authentication and admin privileges", async () => {
    await request(app).get("/api/admin/reports/user-activity").query(range).expect(401);
    await request(app)
      .get("/api/admin/reports/user-activity")
      .query(range)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(403);
    expect(mockedPoolQuery).not.toHaveBeenCalled();
  });

  it("T2: returns the aggregates for all six report types", async () => {
    const types = [
      ["user-activity", "signups", 10],
      ["academic-performance", "records", 4],
      ["quiz", "quizzes_taken", 5],
      ["at-risk", "students", 1],
      ["ai-usage", "requests", 4],
      ["audit-summary", "total_actions", 2],
    ] as const;

    for (const [type, field, expected] of types) {
      const response = await request(app)
        .get(`/api/admin/reports/${type}`)
        .query(range)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(response.body.summary[field]).toBe(expected);
      expect(response.body.sections[0].rows.length).toBeGreaterThan(0);
    }
  });

  it("T3: rejects unknown report types and invalid or excessive date ranges", async () => {
    await request(app)
      .get("/api/admin/reports/unknown")
      .query(range)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get("/api/admin/reports/quiz")
      .query({ from: "2026-02-30", to: range.to })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get("/api/admin/reports/quiz")
      .query({ from: "2025-01-01", to: "2026-01-02" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("T4: neutralizes formula-leading CSV cells and includes a UTF-8 BOM", async () => {
    const response = await request(app)
      .get("/api/admin/reports/at-risk")
      .query({ ...range, format: "csv" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    expect(response.text).toContain("'=HYPERLINK");
  });

  it("T5: records a report audit event without including report rows", async () => {
    await request(app)
      .get("/api/admin/reports/audit-summary")
      .query({ ...range, format: "pdf" })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect("content-type", /application\/pdf/)
      .expect(200);

    const auditCall = mockedPoolQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_logs"));
    expect(auditCall).toBeDefined();
    expect(auditCall?.[1]).toEqual(expect.arrayContaining([
      7, "report", null, "admin.report.generate",
    ]));
    const auditValues = auditCall?.[1] as unknown[];
    expect(JSON.parse(String(auditValues[5]))).toEqual({
      reportType: "audit-summary",
      from: range.from,
      to: range.to,
      format: "pdf",
    });
  });
});
