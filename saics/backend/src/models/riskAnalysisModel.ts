import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "../config/db";
import { RiskAnalysisInput, RiskAnalysisLevel } from "../services/riskAnalysis";

export interface RiskStudentSource {
  studentId: number;
  fullName: string;
  email: string;
  input: RiskAnalysisInput;
}

export interface RiskLevelUpdate {
  studentId: number;
  level: RiskAnalysisLevel;
  topReason: string;
}

interface StudentRow extends RowDataPacket {
  student_id: number;
  full_name: string;
  email: string;
}

interface PerformanceRow extends RowDataPacket {
  student_id: number;
  subject_id: number;
  subject_name: string;
  score: number;
  max_score: number;
  date: string | Date;
  quiz_attempt_id: number | null;
}

interface QuizRow extends RowDataPacket {
  attempt_id: number;
  student_id: number;
  score: number;
  max_score: number;
}

interface ActivityRow extends RowDataPacket {
  student_id: number;
  last_activity_date: string | Date | null;
  current_streak: number;
}

function emptyInput(): RiskAnalysisInput {
  return {
    performanceRecords: [],
    quizAttemptScores: [],
    lastActivityDate: null,
    currentStreak: 0,
    asOfDate: new Date(),
  };
}

function buildInputMap(
  performance: PerformanceRow[],
  quizzes: QuizRow[],
  activity: ActivityRow[]
): Map<number, RiskAnalysisInput> {
  const inputs = new Map<number, RiskAnalysisInput>();
  for (const row of performance) {
    const input = inputs.get(row.student_id) ?? emptyInput();
    input.performanceRecords.push({
      score: Number(row.score),
      max_score: Number(row.max_score),
      date: row.date,
      subject: row.subject_name,
      subjectId: Number(row.subject_id),
      quizAttemptId: row.quiz_attempt_id == null ? null : Number(row.quiz_attempt_id),
    });
    inputs.set(row.student_id, input);
  }
  for (const row of quizzes) {
    const input = inputs.get(row.student_id) ?? emptyInput();
    const recordedInPerformance = input.performanceRecords.some(
      (record) => record.quizAttemptId === Number(row.attempt_id)
    );
    if (!recordedInPerformance) {
      input.quizAttemptScores.push({
        score: Number(row.score),
        max_score: Number(row.max_score),
        attemptId: Number(row.attempt_id),
      });
    }
    inputs.set(row.student_id, input);
  }
  for (const row of activity) {
    const input = inputs.get(row.student_id) ?? emptyInput();
    input.lastActivityDate = row.last_activity_date;
    input.currentStreak = Number(row.current_streak ?? 0);
    inputs.set(row.student_id, input);
  }
  return inputs;
}

async function fetchForStudent(studentId: number): Promise<RiskAnalysisInput> {
  const [performanceRows, quizRows, activityRows] = await Promise.all([
    pool.query<PerformanceRow[]>(
      `SELECT pr.subject_id, s.subject_name, pr.score, pr.max_score,
              pr.assessment_date AS date, pr.student_id, pr.quiz_attempt_id
       FROM performance_records pr
       JOIN subjects s ON s.subject_id = pr.subject_id
       WHERE pr.student_id = ?
       ORDER BY pr.assessment_date ASC, pr.record_id ASC`,
      [studentId]
    ),
    pool.query<QuizRow[]>(
      `SELECT attempt_id, student_id, score, max_score FROM quiz_attempts
       WHERE student_id = ? AND grading_status = 'completed'
         AND score IS NOT NULL AND max_score > 0
         AND NOT EXISTS (
           SELECT 1 FROM performance_records pr
           WHERE pr.quiz_attempt_id = quiz_attempts.attempt_id
         )`,
      [studentId]
    ),
    pool.query<ActivityRow[]>(
      `SELECT (SELECT MAX(activity_date) FROM daily_activity WHERE student_id = ?) AS last_activity_date,
              COALESCE((SELECT current_streak FROM streaks WHERE student_id = ? LIMIT 1), 0) AS current_streak`,
      [studentId, studentId]
    ),
  ]);
  const activity = [{ ...activityRows[0][0], student_id: studentId } as ActivityRow];
  return buildInputMap(performanceRows[0], quizRows[0], activity).get(studentId) ?? emptyInput();
}

async function syncLevels(updates: RiskLevelUpdate[], connection?: PoolConnection): Promise<void> {
  if (!updates.length) return;
  const ownsConnection = !connection;
  const conn = connection ?? await pool.getConnection();
  try {
    if (ownsConnection) await conn.beginTransaction();
    const ids = updates.map((update) => update.studentId);
    const placeholders = ids.map(() => "?").join(", ");
    await conn.query<RowDataPacket[]>(
      `SELECT student_id FROM students WHERE student_id IN (${placeholders}) ORDER BY student_id FOR UPDATE`,
      ids
    );
    const [existingRows] = await conn.query<RowDataPacket[]>(
      `SELECT student_id, level FROM risk_analysis_state
       WHERE student_id IN (${placeholders}) FOR UPDATE`,
      ids
    );
    const previousLevels = new Map<number, string>(
      existingRows.map((row) => [Number(row.student_id), String(row.level)])
    );
    const values: (number | string)[] = [];
    const rowsSql = updates.map((update) => {
      values.push(update.studentId, update.level);
      return "(?, ?)";
    }).join(", ");
    await conn.query(
      `INSERT INTO risk_analysis_state (student_id, level)
       VALUES ${rowsSql}
       ON DUPLICATE KEY UPDATE level = VALUES(level), updated_at = CURRENT_TIMESTAMP`,
      values
    );

    const transitions = updates.filter((update) =>
      update.level === "high" && previousLevels.get(update.studentId) !== "high"
    );
    if (transitions.length) {
      const notificationValues: (string | number)[] = [];
      const notificationSql = transitions.map((update) => {
        notificationValues.push(
          update.studentId,
          `Your academic risk analysis is now High. ${update.topReason}`.slice(0, 255),
          "alert"
        );
        return "(?, ?, ?)";
      }).join(", ");
      await conn.query(
        `INSERT INTO notifications (student_id, message, type) VALUES ${notificationSql}`,
        notificationValues
      );
    }
    if (ownsConnection) await conn.commit();
  } catch (error) {
    if (ownsConnection) await conn.rollback();
    throw error;
  } finally {
    if (ownsConnection) conn.release();
  }
}

export const RiskAnalysisModel = {
  async findForStudent(studentId: number): Promise<RiskAnalysisInput> {
    return fetchForStudent(studentId);
  },

  async findAllStudents(): Promise<RiskStudentSource[]> {
    const [studentRows, performanceRows, quizRows, activityRows] = await Promise.all([
      pool.query<StudentRow[]>(
        `SELECT student_id, full_name, email FROM students
         WHERE role = 'student' AND deleted_at IS NULL AND is_suspended = FALSE
         ORDER BY student_id`
      ),
      pool.query<PerformanceRow[]>(
        `SELECT pr.student_id, pr.subject_id, s.subject_name, pr.score, pr.max_score,
                pr.assessment_date AS date, pr.quiz_attempt_id
         FROM performance_records pr
         JOIN subjects s ON s.subject_id = pr.subject_id
         JOIN students st ON st.student_id = pr.student_id
         WHERE st.role = 'student' AND st.deleted_at IS NULL AND st.is_suspended = FALSE
         ORDER BY pr.assessment_date ASC, pr.record_id ASC`
      ),
      pool.query<QuizRow[]>(
        `SELECT qa.attempt_id, qa.student_id, qa.score, qa.max_score
         FROM quiz_attempts qa
         JOIN students st ON st.student_id = qa.student_id
         WHERE st.role = 'student' AND st.deleted_at IS NULL AND st.is_suspended = FALSE
           AND qa.grading_status = 'completed' AND qa.score IS NOT NULL AND qa.max_score > 0
           AND NOT EXISTS (
             SELECT 1 FROM performance_records pr WHERE pr.quiz_attempt_id = qa.attempt_id
           )`
      ),
      pool.query<ActivityRow[]>(
        `SELECT st.student_id, activity.last_activity_date,
                COALESCE(sr.current_streak, 0) AS current_streak
         FROM students st
         LEFT JOIN (
           SELECT student_id, MAX(activity_date) AS last_activity_date
           FROM daily_activity GROUP BY student_id
         ) activity ON activity.student_id = st.student_id
         LEFT JOIN streaks sr ON sr.student_id = st.student_id
         WHERE st.role = 'student' AND st.deleted_at IS NULL AND st.is_suspended = FALSE`
      ),
    ]);

    const inputs = buildInputMap(performanceRows[0], quizRows[0], activityRows[0]);
    return studentRows[0].map((student) => ({
      studentId: Number(student.student_id),
      fullName: student.full_name,
      email: student.email,
      input: inputs.get(Number(student.student_id)) ?? emptyInput(),
    }));
  },

  async syncStudentLevel(update: RiskLevelUpdate): Promise<void> {
    await syncLevels([update]);
  },

  async syncAllLevels(updates: RiskLevelUpdate[]): Promise<void> {
    await syncLevels(updates);
  },
};
