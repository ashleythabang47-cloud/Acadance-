import "dotenv/config";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/db";

const demoStudents = [
  {
    name: "DEMO Improving Student",
    email: "demo.improving@example.com",
    scores: [62, 68, 76, 84, 90, 94],
    activityDaysAgo: 0,
    streak: 7,
    quizScore: 82,
  },
  {
    name: "DEMO Declining Student",
    email: "demo.declining@example.com",
    scores: [96, 90, 84, 62, 56, 52],
    activityDaysAgo: 2,
    streak: 3,
    quizScore: 62,
  },
  {
    name: "DEMO Inactive Student",
    email: "demo.inactive@example.com",
    scores: [88, 82, 76, 48, 30, 18],
    activityDaysAgo: 18,
    streak: 0,
    quizScore: 20,
  },
];

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function getOrCreateStudent(name: string, email: string, password: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT student_id FROM students WHERE email = ? LIMIT 1`,
    [email]
  );
  if (rows[0]) {
    const studentId = Number(rows[0].student_id);
    await pool.query(
      `UPDATE students SET full_name = ?, role = 'student', email_verified = TRUE,
         is_suspended = FALSE, deleted_at = NULL WHERE student_id = ?`,
      [name, studentId]
    );
    return studentId;
  }
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO students (full_name, email, password_hash, role, email_verified)
     VALUES (?, ?, ?, 'student', TRUE)`,
    [name, email, await bcrypt.hash(password, 10)]
  );
  return result.insertId;
}

async function seedAnalyticsDemo(): Promise<void> {
  await pool.query(
    `INSERT INTO subjects (subject_name, subject_code)
     VALUES ('Software Development', 'ITDEMO')
     ON DUPLICATE KEY UPDATE subject_name = VALUES(subject_name)`
  );
  const [subjectRows] = await pool.query<RowDataPacket[]>(
    `SELECT subject_id FROM subjects WHERE subject_code = 'ITDEMO' LIMIT 1`
  );
  const subjectId = Number(subjectRows[0]?.subject_id);
  if (!subjectId) throw new Error("Could not prepare the demo subject.");

  const [quizRows] = await pool.query<RowDataPacket[]>(
    `SELECT quiz_id FROM quizzes WHERE title = 'DEMO Risk Analysis Practice' LIMIT 1`
  );
  let quizId = Number(quizRows[0]?.quiz_id);
  if (!quizId) {
    const [quizResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO quizzes (subject_id, title, difficulty, created_by)
       VALUES (?, 'DEMO Risk Analysis Practice', 'easy', NULL)`,
      [subjectId]
    );
    quizId = quizResult.insertId;
  }

  const configuredPassword = process.env.ANALYTICS_DEMO_PASSWORD;
  const generatedPassword = configuredPassword || randomBytes(24).toString("base64url");
  if (
    configuredPassword &&
    (configuredPassword.length < 12 || configuredPassword.length > 128 ||
      Buffer.byteLength(configuredPassword, "utf8") > 72)
  ) {
    throw new Error("ANALYTICS_DEMO_PASSWORD must be 12-128 characters and at most 72 UTF-8 bytes.");
  }

  for (const demo of demoStudents) {
    const studentId = await getOrCreateStudent(demo.name, demo.email, generatedPassword);
    await pool.query(`DELETE FROM performance_records WHERE student_id = ?`, [studentId]);
    await pool.query(
      `DELETE qa FROM quiz_attempts qa
       JOIN quizzes q ON q.quiz_id = qa.quiz_id
       WHERE qa.student_id = ? AND q.title = 'DEMO Risk Analysis Practice'`,
      [studentId]
    );
    await pool.query(`DELETE FROM daily_activity WHERE student_id = ?`, [studentId]);

    for (let index = 0; index < demo.scores.length; index += 1) {
      await pool.query(
        `INSERT INTO performance_records
          (student_id, subject_id, assessment_name, score, max_score, assessment_date)
         VALUES (?, ?, ?, ?, 100, ?)`,
        [
          studentId,
          subjectId,
          `DEMO Assessment ${index + 1}`,
          demo.scores[index],
          dateDaysAgo((demo.scores.length - index) * 5),
        ]
      );
    }

    await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, score, max_score, grading_status, completed_at)
       VALUES (?, ?, ?, 100, 'completed', CURRENT_TIMESTAMP)`,
      [quizId, studentId, demo.quizScore]
    );
    await pool.query(
      `INSERT INTO daily_activity (student_id, activity_date, activity_count)
       VALUES (?, ?, 1)`,
      [studentId, dateDaysAgo(demo.activityDaysAgo)]
    );
    await pool.query(
      `INSERT INTO streaks (student_id, current_streak, longest_streak, last_activity_date)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE current_streak = VALUES(current_streak),
         longest_streak = VALUES(longest_streak), last_activity_date = VALUES(last_activity_date)`,
      [studentId, demo.streak, Math.max(demo.streak, 7), dateDaysAgo(demo.activityDaysAgo)]
    );
  }

  console.log("Risk analysis demo data is ready (three DEMO student accounts).");
}

seedAnalyticsDemo()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Could not seed analytics demo data.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
