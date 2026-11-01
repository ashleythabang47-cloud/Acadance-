import { pool } from "../src/config/db";
import { StudentModel } from "../src/models/studentModel";

jest.mock("../src/config/db", () => ({
  pool: { query: jest.fn() },
}));

describe("StudentModel.cleanupExpiredUnverified", () => {
  it("deletes only students unverified for more than 24 hours", async () => {
    jest.mocked(pool.query).mockResolvedValue([{ affectedRows: 2 }, []] as never);

    await expect(StudentModel.cleanupExpiredUnverified()).resolves.toBe(2);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /DELETE FROM students\s+WHERE email_verified = FALSE AND role = 'student'\s+AND created_at < DATE_SUB\(CURRENT_TIMESTAMP, INTERVAL 24 HOUR\)/i
      )
    );
  });
});
