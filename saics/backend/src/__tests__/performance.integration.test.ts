import request from "supertest";
import app from "../app";
import jwt from "jsonwebtoken";
import { PerformanceModel } from "../models/performanceModel";
import { StreakModel } from "../models/streakModel";

jest.mock("../models/performanceModel");
jest.mock("../models/streakModel");

const mockedPerformanceModel = PerformanceModel as jest.Mocked<typeof PerformanceModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const authToken = jwt.sign({ studentId: 1, email: "test@example.com" }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockedStreakModel.recordActivity.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: "2026-07-20",
  });
});

describe("POST /api/performance", () => {
  it("rejects a request with no auth token", async () => {
    const res = await request(app).post("/api/performance").send({
      subjectId: 1,
      assessmentName: "Test 1",
      score: 80,
      assessmentDate: "2026-07-20",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a score greater than maxScore", async () => {
    const res = await request(app)
      .post("/api/performance")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        subjectId: 1,
        assessmentName: "Test 1",
        score: 120,
        maxScore: 100,
        assessmentDate: "2026-07-20",
      });
    expect(res.status).toBe(400);
  });

  it("rejects a negative score", async () => {
    const res = await request(app)
      .post("/api/performance")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        subjectId: 1,
        assessmentName: "Test 1",
        score: -5,
        assessmentDate: "2026-07-20",
      });
    expect(res.status).toBe(400);
  });

  it("creates a valid record and records streak activity", async () => {
    mockedPerformanceModel.create.mockResolvedValue(99);

    const res = await request(app)
      .post("/api/performance")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        subjectId: 1,
        assessmentName: "Test 1",
        score: 85,
        maxScore: 100,
        assessmentDate: "2026-07-20",
      });

    expect(res.status).toBe(201);
    expect(res.body.recordId).toBe(99);
    expect(mockedStreakModel.recordActivity).toHaveBeenCalledWith(1);
  });
});
