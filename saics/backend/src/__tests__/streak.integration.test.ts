import request from "supertest";
import app from "../app";
import jwt from "jsonwebtoken";
import { StreakModel } from "../models/streakModel";
import { StudentModel } from "../models/studentModel";

jest.mock("../models/streakModel");
jest.mock("../models/studentModel");

const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;
const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;

const authToken = jwt.sign({ studentId: 7, email: "streak@example.com" }, process.env.JWT_SECRET!);

const week = Array.from({ length: 7 }, (_, i) => ({ date: `2026-07-${String(14 + i).padStart(2, "0")}`, count: i % 2 }));

beforeEach(() => {
  jest.clearAllMocks();
  mockedStudentModel.findAuthState.mockResolvedValue({
    role: "student",
    is_suspended: false,
    deleted_at: null,
    token_version: 0,
    force_password_reset: false,
  });
  mockedStreakModel.getStreakInfo.mockResolvedValue({
    current_streak: 3,
    longest_streak: 5,
    last_activity_date: "2026-07-20",
  });
  mockedStreakModel.getLast7Days.mockResolvedValue(week);
  mockedStreakModel.getActivityRange.mockImplementation(async (_id, days) =>
    Array.from({ length: days }, (_, i) => ({ date: `d${i}`, count: 0 }))
  );
});

describe("GET /api/streaks/me", () => {
  it("keeps the original response shape when no history is requested", async () => {
    const res = await request(app).get("/api/streaks/me").set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.streak.current_streak).toBe(3);
    expect(res.body.last7Days).toHaveLength(7);
    expect(res.body).not.toHaveProperty("activity");
    expect(mockedStreakModel.getActivityRange).not.toHaveBeenCalled();
  });

  it("adds an activity history when ?days is requested", async () => {
    const res = await request(app).get("/api/streaks/me?days=182").set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.last7Days).toHaveLength(7);
    expect(res.body.activity).toHaveLength(182);
    expect(mockedStreakModel.getActivityRange).toHaveBeenCalledWith(7, 182);
  });

  it("ignores invalid or small day values", async () => {
    for (const days of ["abc", "3", "-10", "1.5"]) {
      const res = await request(app).get(`/api/streaks/me?days=${days}`).set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("activity");
    }
    expect(mockedStreakModel.getActivityRange).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/streaks/me?days=182");
    expect(res.status).toBe(401);
  });
});
