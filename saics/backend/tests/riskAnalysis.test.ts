import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app";
import { StudentModel } from "../src/models/studentModel";
import { RiskAnalysisModel } from "../src/models/riskAnalysisModel";
import { calculateRisk, RiskAnalysisInput } from "../src/services/riskAnalysis";

jest.mock("../src/models/studentModel");
jest.mock("../src/models/riskAnalysisModel");

const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedRiskAnalysisModel = RiskAnalysisModel as jest.Mocked<typeof RiskAnalysisModel>;

function records(scores: number[]) {
  return scores.map((score, index) => ({
    score,
    max_score: 100,
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    subject: "Software Development",
    subjectId: 1,
  }));
}

function input(scores: number[], lastActivityDate: string | null = "2026-10-28"): RiskAnalysisInput {
  return {
    performanceRecords: records(scores),
    quizAttemptScores: [],
    lastActivityDate,
    currentStreak: 1,
    asOfDate: "2026-10-29",
  };
}

function token(studentId: number, role: "student" | "admin" = "student") {
  const secret = process.env.JWT_SECRET;
  const signed = jwt.sign({ studentId, tokenVersion: 0, role }, secret!);
  return `Bearer ${signed}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedStudentModel.findAuthState.mockImplementation(async (studentId) => ({
    role: studentId === 99 ? "admin" : "student",
    is_suspended: false,
    deleted_at: null,
    token_version: 0,
    force_password_reset: false,
  }));
  mockedRiskAnalysisModel.syncStudentLevel.mockResolvedValue(undefined);
  mockedRiskAnalysisModel.syncAllLevels.mockResolvedValue(undefined);
});

describe("calculateRisk", () => {
  it("classifies improving results as Low and declining results with a declining reason", () => {
    const improving = calculateRisk({
      ...input([58, 65, 72, 81, 88, 93]),
      lastActivityDate: "2026-10-29",
    });
    const declining = calculateRisk({
      ...input([90, 85, 80, 62, 56, 52]),
      lastActivityDate: "2026-10-29",
    });

    expect(improving.level).toBe("low");
    expect(declining.level === "insufficient_data" ? "" : declining.reasons.join(" ")).toMatch(/declined/i);
    expect(["medium", "high"]).toContain(declining.level);
  });

  it("returns insufficient_data before three valid records", () => {
    expect(calculateRisk(input([90, 80]))).toEqual({ level: "insufficient_data" });
  });

  it("includes the inactivity duration in the reason", () => {
    const result = calculateRisk(input([80, 80, 80], "2026-10-10"));

    if (result.level === "insufficient_data") throw new Error("Expected enough data for risk analysis.");
    expect(result.reasons.join(" ")).toMatch(/no recorded study activity for 19 days/i);
  });

  it("does not include a quiz again in the quiz-average signal when already recorded", () => {
    const result = calculateRisk({
      ...input([80, 80, 80]),
      performanceRecords: records([80, 80, 20]).map((record, index) => ({
        ...record,
        quizAttemptId: index === 2 ? 42 : null,
      })),
      quizAttemptScores: [{ score: 20, max_score: 100, attemptId: 42 }],
    });

    if (result.level === "insufficient_data") throw new Error("Expected enough data for risk analysis.");
    expect(result.signals.quizAverage).toBeNull();
    expect(result.signals.recentAverage).toBeCloseTo(60);
  });
});

describe("risk analytics endpoints", () => {
  it("only evaluates the authenticated student's data, ignoring another requested id", async () => {
    mockedRiskAnalysisModel.findForStudent.mockResolvedValue(input([70, 75, 80]));

    await request(app)
      .get("/api/analytics/me?studentId=4")
      .set("Authorization", token(3))
      .expect(200);

    expect(mockedRiskAnalysisModel.findForStudent).toHaveBeenCalledWith(3);
  });

  it("rejects a student token on the admin analytics endpoint", async () => {
    await request(app)
      .get("/api/admin/analytics/at-risk")
      .set("Authorization", token(3))
      .expect(403);
    expect(mockedRiskAnalysisModel.findAllStudents).not.toHaveBeenCalled();
  });

  it("returns a paginated list sorted from highest to lowest risk", async () => {
    mockedRiskAnalysisModel.findAllStudents.mockResolvedValue([
      { studentId: 1, fullName: "Low Risk", email: "low@example.com", input: input([70, 75, 80]) },
      { studentId: 2, fullName: "Declining Risk", email: "declining@example.com", input: input([90, 85, 80, 62, 56, 52]) },
      { studentId: 3, fullName: "High Risk", email: "high@example.com", input: {
        ...input([95, 95, 95, 10, 10, 10], "2026-10-01"),
        quizAttemptScores: [{ score: 10, max_score: 100 }],
      } },
    ]);

    const response = await request(app)
      .get("/api/admin/analytics/at-risk?page=1&limit=1")
      .set("Authorization", token(99))
      .expect(200);

    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(1);
    expect(response.body.total).toBe(2);
    expect(response.body.students).toHaveLength(1);
    expect(response.body.students[0].studentId).toBe(3);
    expect(response.body.students[0]).not.toHaveProperty("password_hash");
    expect(response.body.students[0]).not.toHaveProperty("token");

    const secondPage = await request(app)
      .get("/api/admin/analytics/at-risk?page=2&limit=1")
      .set("Authorization", token(99))
      .expect(200);
    expect(secondPage.body.students[0].studentId).toBe(2);
    expect(response.body.students[0].score).toBeGreaterThan(secondPage.body.students[0].score);
  });
});
