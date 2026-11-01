import { pool } from "../config/db";
import { AdminReportModel } from "../models/adminReportModel";

jest.mock("../config/db", () => ({
  pool: { query: jest.fn() },
}));

const mockedPoolQuery = jest.mocked(pool.query);
const range = { from: "2026-10-01", to: "2026-10-31" };

function queryRows<T>(value: T[]) {
  return [value, []] as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("aggregates signup verification, activity, suspension, and role-change counts", async () => {
  mockedPoolQuery
    .mockResolvedValueOnce(queryRows([{
      signups: 10, verified: 8, unverified: 2, active_users: 6, suspended_users: 1,
    }]))
    .mockResolvedValueOnce(queryRows([{ day: "2026-10-02", signups: 3, verified: 2, unverified: 1 }]))
    .mockResolvedValueOnce(queryRows([{ role_changes: 2, suspensions: 1 }]));

  const report = await AdminReportModel.userActivity(range, {});

  expect(report.summary).toEqual({
    signups: 10,
    verified: 8,
    unverified: 2,
    active_users: 6,
    suspended_users: 1,
    role_changes: 2,
    suspensions: 1,
  });
  expect(report.sections[0].rows[0]).toMatchObject({ day: "2026-10-02", signups: 3 });
});

it("reports academic subject averages, score bands, and trends", async () => {
  mockedPoolQuery
    .mockResolvedValueOnce(queryRows([{ subject_id: 2, subject_name: "Science", records: 4, average_score: 75 }]))
    .mockResolvedValueOnce(queryRows([{ records: 4, average_score: 75 }]))
    .mockResolvedValueOnce(queryRows([{ score_band: "70-89%", records: 4 }]))
    .mockResolvedValueOnce(queryRows([{ day: "2026-10-02", average_score: 75, records: 4 }]));

  const report = await AdminReportModel.academicPerformance(range, {});

  expect(report.summary).toMatchObject({ records: 4, average_score: 75 });
  expect(report.sections[0].rows[0]).toMatchObject({ subject_name: "Science", records: 4, average_score: 75 });
  expect(report.sections[1].rows[0]).toMatchObject({ score_band: "70-89%", records: 4 });
  expect(report.sections[2].rows[0]).toMatchObject({ day: "2026-10-02", average_score: 75 });
});

it("summarizes quiz attempts, pass rate, pending grading, and popularity", async () => {
  mockedPoolQuery
    .mockResolvedValueOnce(queryRows([{
      quizzes_taken: 5, completed: 4, pending_grading: 1, average_score: 80, pass_rate: 75,
    }]))
    .mockResolvedValueOnce(queryRows([
      { quiz_id: 2, title: "Quiz A", subject_name: "Science", attempts: 5, average_score: 80 },
      { quiz_id: 3, title: "Quiz B", subject_name: "Science", attempts: 0, average_score: null },
    ]));

  const report = await AdminReportModel.quiz(range, {});

  expect(report.summary).toMatchObject({
    quizzes_taken: 5, completed: 4, pending_grading: 1, average_score: 80, pass_rate: 75,
    most_attempted: "Quiz A", least_attempted: "Quiz B",
  });
  expect(report.sections[0].rows).toHaveLength(2);
});

it("totals daily AI provider successes, failures, and rate limits", async () => {
  mockedPoolQuery.mockResolvedValueOnce(queryRows([
    { day: "2026-10-02", provider: "groq", operation: "grading", requests: 4, succeeded: 3, failed: 1, rate_limited: 1 },
    { day: "2026-10-03", provider: "gemini", operation: "generation", requests: 2, succeeded: 2, failed: 0, rate_limited: 0 },
  ]));

  const report = await AdminReportModel.aiUsage(range, {});

  expect(report.summary).toEqual({ requests: 6, succeeded: 5, failed: 1, rate_limited: 1 });
  expect(report.sections[0].rows).toHaveLength(2);
});

it("summarizes audit actions by type and admin without including audit details", async () => {
  mockedPoolQuery
    .mockResolvedValueOnce(queryRows([{ action: "admin.user.update", actions: 2 }]))
    .mockResolvedValueOnce(queryRows([{ admin_name: "Report Admin", actions: 2 }]))
    .mockResolvedValueOnce(queryRows([{ total_actions: 2 }]));

  const report = await AdminReportModel.auditSummary(range);

  expect(report.summary.total_actions).toBe(2);
  expect(report.sections[0].rows[0]).toMatchObject({ action: "admin.user.update", actions: 2 });
  expect(report.sections[1].rows[0]).toMatchObject({ admin_name: "Report Admin", actions: 2 });
});
