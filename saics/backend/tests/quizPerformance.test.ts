import { pool } from "../src/config/db";
import { PerformanceModel } from "../src/models/performanceModel";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app";
import { StudentModel } from "../src/models/studentModel";

jest.mock("../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../src/models/studentModel");

const mockedPoolQuery = jest.mocked(pool.query);
const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;

describe("quiz performance sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("T1/T2: upserts one quiz record with attempt values, idempotently", async () => {
    mockedPoolQuery.mockResolvedValueOnce([[
      {
        student_id: 17,
        score: 8,
        max_score: 10,
        assessment_date: "2026-11-01",
        title: "Data Structures",
        subject_id: 4,
      },
    ], []] as never);
    mockedPoolQuery.mockResolvedValueOnce([{ insertId: 55, affectedRows: 1 }, []] as never);

    await PerformanceModel.syncCompletedQuizAttempt(55);

    expect(mockedPoolQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("ON DUPLICATE KEY UPDATE"),
      [17, 4, "Quiz: Data Structures", 8, 10, "2026-11-01", 55]
    );

    mockedPoolQuery.mockResolvedValueOnce([[
      {
        student_id: 17,
        score: 9,
        max_score: 10,
        assessment_date: "2026-11-02",
        title: "Data Structures",
        subject_id: 4,
      },
    ], []] as never);
    mockedPoolQuery.mockResolvedValueOnce([{ insertId: 0, affectedRows: 2 }, []] as never);
    await PerformanceModel.syncCompletedQuizAttempt(55);

    expect(mockedPoolQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("ON DUPLICATE KEY UPDATE"),
      [17, 4, "Quiz: Data Structures", 9, 10, "2026-11-02", 55]
    );
  });

  it("T3: does not create records for attempts not fully completed", async () => {
    mockedPoolQuery.mockResolvedValueOnce([[], []] as never);

    await PerformanceModel.syncCompletedQuizAttempt(77);

    expect(mockedPoolQuery).toHaveBeenCalledTimes(1);
  });

  it("T4: returns the source flag from the performance chart endpoint", async () => {
    mockedStudentModel.findAuthState.mockResolvedValue({
      role: "student",
      is_suspended: false,
      deleted_at: null,
      token_version: 0,
      force_password_reset: false,
    });
    const records = [{
      record_id: 55,
      student_id: 17,
      subject_id: 4,
      subject_name: "Data Structures",
      assessment_name: "Quiz: Data Structures",
      score: 8,
      max_score: 10,
      assessment_date: "2026-11-01",
      source: "quiz",
      quiz_attempt_id: 55,
    }];
    mockedPoolQuery.mockResolvedValueOnce([records, []] as never);
    const token = jwt.sign({ studentId: 17, tokenVersion: 0 }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/api/performance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.records[0]).toMatchObject({ source: "quiz", quiz_attempt_id: 55 });
  });
});
