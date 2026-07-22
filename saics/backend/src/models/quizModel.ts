import { pool } from "../config/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { GeneratedQuestion } from "../services/aiService";

export interface Quiz {
  quiz_id: number;
  subject_id: number;
  subject_name?: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  created_by: number;
  created_at: string;
  question_count?: number;
}

export interface QuizQuestion {
  question_id: number;
  quiz_id: number;
  question_text: string;
  question_type: "multiple_choice" | "short_answer" | "long_answer";
  correct_answer: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
}

export const QuizModel = {
  async createQuiz(
    subjectId: number,
    title: string,
    difficulty: "easy" | "medium" | "hard",
    createdBy: number,
    questions: GeneratedQuestion[]
  ): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO quizzes (subject_id, title, difficulty, created_by) VALUES (?, ?, ?, ?)`,
      [subjectId, title, difficulty, createdBy]
    );
    const quizId = result.insertId;

    for (const q of questions) {
      await pool.query(
        `INSERT INTO quiz_questions
          (quiz_id, question_text, question_type, correct_answer, option_a, option_b, option_c, option_d)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quizId,
          q.question_text,
          q.question_type,
          q.correct_answer,
          q.option_a || null,
          q.option_b || null,
          q.option_c || null,
          q.option_d || null,
        ]
      );
    }

    return quizId;
  },

  async listAll(): Promise<Quiz[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT q.*, s.subject_name,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) AS question_count
       FROM quizzes q
       JOIN subjects s ON s.subject_id = q.subject_id
       ORDER BY q.created_at DESC`
    );
    return rows as Quiz[];
  },

  async findById(quizId: number): Promise<Quiz | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT q.*, s.subject_name FROM quizzes q
       JOIN subjects s ON s.subject_id = q.subject_id
       WHERE q.quiz_id = ? LIMIT 1`,
      [quizId]
    );
    return (rows[0] as Quiz) || null;
  },

  // Excludes correct_answer — students shouldn't receive it before submitting.
  async getQuestionsForStudent(
    quizId: number
  ): Promise<Omit<QuizQuestion, "correct_answer">[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT question_id, quiz_id, question_text, question_type, option_a, option_b, option_c, option_d
       FROM quiz_questions WHERE quiz_id = ?`,
      [quizId]
    );
    return rows as Omit<QuizQuestion, "correct_answer">[];
  },

  async getQuestionsWithAnswers(quizId: number): Promise<QuizQuestion[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM quiz_questions WHERE quiz_id = ?`,
      [quizId]
    );
    return rows as QuizQuestion[];
  },

  async createAttempt(quizId: number, studentId: number): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO quiz_attempts (quiz_id, student_id) VALUES (?, ?)`,
      [quizId, studentId]
    );
    return result.insertId;
  },

  async recordAnswer(
    attemptId: number,
    questionId: number,
    studentAnswer: string,
    isCorrect: boolean
  ): Promise<void> {
    await pool.query(
      `INSERT INTO quiz_attempt_answers (attempt_id, question_id, student_answer, is_correct)
       VALUES (?, ?, ?, ?)`,
      [attemptId, questionId, studentAnswer, isCorrect]
    );
  },

  async completeAttempt(attemptId: number, score: number, maxScore: number): Promise<void> {
    await pool.query(
      `UPDATE quiz_attempts SET score = ?, max_score = ?, completed_at = CURRENT_TIMESTAMP
       WHERE attempt_id = ?`,
      [score, maxScore, attemptId]
    );
  },

  async getAttemptHistory(studentId: number): Promise<RowDataPacket[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT qa.attempt_id, qa.score, qa.max_score, qa.completed_at, q.title, s.subject_name
       FROM quiz_attempts qa
       JOIN quizzes q ON q.quiz_id = qa.quiz_id
       JOIN subjects s ON s.subject_id = q.subject_id
       WHERE qa.student_id = ? AND qa.completed_at IS NOT NULL
       ORDER BY qa.completed_at DESC`,
      [studentId]
    );
    return rows;
  },
};
