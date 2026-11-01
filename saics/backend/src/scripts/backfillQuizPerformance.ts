import "dotenv/config";
import { RowDataPacket } from "mysql2";
import { pool } from "../config/db";
import { PerformanceModel } from "../models/performanceModel";

async function backfillQuizPerformance() {
  try {
    const [attempts] = await pool.query<RowDataPacket[]>(
      `SELECT attempt_id FROM quiz_attempts
       WHERE grading_status = 'completed' AND score IS NOT NULL AND max_score > 0
       ORDER BY attempt_id`
    );
    for (const attempt of attempts) {
      await PerformanceModel.syncCompletedQuizAttempt(Number(attempt.attempt_id));
    }
    console.log(`Backfilled ${attempts.length} completed quiz performance record(s).`);
  } catch (error) {
    console.error("Quiz performance backfill failed.", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void backfillQuizPerformance();
