import { PoolConnection } from "mysql2/promise";
import { pool } from "../src/config/db";
import { RiskAnalysisModel } from "../src/models/riskAnalysisModel";

jest.mock("../src/config/db", () => ({
  pool: { getConnection: jest.fn(), query: jest.fn() },
}));

const states = new Map<number, string>();
const notifications: string[] = [];

const connection = {
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
  query: jest.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("SELECT student_id FROM students")) return [[], []] as const;
    if (sql.includes("SELECT student_id, level FROM risk_analysis_state")) {
      const ids = values.map(Number);
      return [[...states.entries()]
        .filter(([id]) => ids.includes(id))
        .map(([student_id, level]) => ({ student_id, level }))] as const;
    }
    if (sql.includes("INSERT INTO risk_analysis_state")) {
      for (let index = 0; index < values.length; index += 2) {
        states.set(Number(values[index]), String(values[index + 1]));
      }
      return [{ affectedRows: 1 }, []] as const;
    }
    if (sql.includes("INSERT INTO notifications")) {
      for (let index = 1; index < values.length; index += 3) {
        notifications.push(String(values[index]));
      }
      return [{ affectedRows: 1 }, []] as const;
    }
    return [{ affectedRows: 0 }, []] as const;
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  states.clear();
  notifications.length = 0;
  jest.mocked(pool.getConnection).mockResolvedValue(connection as unknown as PoolConnection);
});

it("creates one notification when a student first moves to High", async () => {
  const update = {
    studentId: 12,
    level: "high" as const,
    topReason: "Your recent assessment average is 20%.",
  };

  await RiskAnalysisModel.syncStudentLevel(update);
  await RiskAnalysisModel.syncStudentLevel(update);

  expect(notifications).toHaveLength(1);
  expect(states.get(12)).toBe("high");
});
