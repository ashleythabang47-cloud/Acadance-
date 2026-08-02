import request from "supertest";
import app from "../app";
import jwt from "jsonwebtoken";
import { PerformanceModel } from "../models/performanceModel";
import { StreakModel } from "../models/streakModel";
import { NotificationModel } from "../models/notificationModel";
import { SubjectModel } from "../models/subjectModel";

jest.mock("../models/performanceModel");
jest.mock("../models/streakModel");
jest.mock("../models/notificationModel");
jest.mock("../models/subjectModel");

const mockedPerformanceModel = PerformanceModel as jest.Mocked<typeof PerformanceModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;
const mockedNotificationModel = NotificationModel as jest.Mocked<typeof NotificationModel>;
const mockedSubjectModel = SubjectModel as jest.Mocked<typeof SubjectModel>;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const authToken = jwt.sign({ studentId: 1, email: "test@example.com" }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockedStreakModel.recordActivity.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: "2026-07-20",
  });
  mockedSubjectModel.findById.mockResolvedValue({
    subject_id: 1,
    subject_name: "Databases",
    subject_code: "ITDBS1",
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
      .set("Cookie", `token=${authToken}`)
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
      .set("Cookie", `token=${authToken}`)
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
      .set("Cookie", `token=${authToken}`)
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

  it("does NOT create a notification for a passing score", async () => {
    mockedPerformanceModel.create.mockResolvedValue(100);

    await request(app)
      .post("/api/performance")
      .set("Cookie", `token=${authToken}`)
      .send({
        subjectId: 1,
        assessmentName: "Test 1",
        score: 85,
        maxScore: 100,
        assessmentDate: "2026-07-20",
      });

    expect(mockedNotificationModel.create).not.toHaveBeenCalled();
  });

  it("creates a low-score alert notification mentioning the subject when below the threshold", async () => {
    mockedPerformanceModel.create.mockResolvedValue(101);

    const res = await request(app)
      .post("/api/performance")
      .set("Cookie", `token=${authToken}`)
      .send({
        subjectId: 1,
        assessmentName: "Test 1",
        score: 30,
        maxScore: 100,
        assessmentDate: "2026-07-20",
      });

    expect(res.status).toBe(201);
    expect(mockedNotificationModel.create).toHaveBeenCalledTimes(1);
    const [studentId, message, type] = mockedNotificationModel.create.mock.calls[0];
    expect(studentId).toBe(1);
    expect(message).toContain("Databases");
    expect(type).toBe("alert");
  });
});
