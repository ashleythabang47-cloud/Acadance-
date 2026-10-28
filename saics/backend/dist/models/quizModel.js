"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizModel = void 0;
const db_1 = require("../config/db");
exports.QuizModel = {
    async createQuiz(subjectId, title, difficulty, createdBy, questions) {
        const [result] = await db_1.pool.query(`INSERT INTO quizzes (subject_id, title, difficulty, created_by) VALUES (?, ?, ?, ?)`, [subjectId, title, difficulty, createdBy]);
        const quizId = result.insertId;
        for (const q of questions) {
            await db_1.pool.query(`INSERT INTO quiz_questions
          (quiz_id, question_text, question_type, correct_answer, option_a, option_b, option_c, option_d, model_answer, rubric)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                quizId,
                q.question_text,
                q.question_type,
                q.correct_answer,
                q.option_a || null,
                q.option_b || null,
                q.option_c || null,
                q.option_d || null,
                q.model_answer || null,
                q.rubric ? JSON.stringify(q.rubric) : null,
            ]);
        }
        return quizId;
    },
    async listAll() {
        const [rows] = await db_1.pool.query(`SELECT q.*, s.subject_name,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) AS question_count
       FROM quizzes q
       JOIN subjects s ON s.subject_id = q.subject_id
       ORDER BY q.created_at DESC`);
        return rows;
    },
    async findById(quizId) {
        const [rows] = await db_1.pool.query(`SELECT q.*, s.subject_name FROM quizzes q
       JOIN subjects s ON s.subject_id = q.subject_id
       WHERE q.quiz_id = ? LIMIT 1`, [quizId]);
        return rows[0] || null;
    },
    // Excludes correct_answer — students shouldn't receive it before submitting.
    async getQuestionsForStudent(quizId) {
        const [rows] = await db_1.pool.query(`SELECT question_id, quiz_id, question_text, question_type, option_a, option_b, option_c, option_d
       FROM quiz_questions WHERE quiz_id = ?`, [quizId]);
        return rows;
    },
    async getQuestionsWithAnswers(quizId) {
        const [rows] = await db_1.pool.query(`SELECT * FROM quiz_questions WHERE quiz_id = ?`, [quizId]);
        return rows;
    },
    async createAttempt(quizId, studentId) {
        const [result] = await db_1.pool.query(`INSERT INTO quiz_attempts (quiz_id, student_id) VALUES (?, ?)`, [quizId, studentId]);
        return result.insertId;
    },
    async recordAnswer(attemptId, questionId, studentAnswer, score, maxScore, feedback, criterionComments, gradingStatus, isCorrect) {
        await db_1.pool.query(`INSERT INTO quiz_attempt_answers
        (attempt_id, question_id, student_answer, is_correct, score, max_score, feedback, criterion_comments, grading_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            attemptId,
            questionId,
            studentAnswer,
            isCorrect,
            score,
            maxScore,
            feedback,
            criterionComments ? JSON.stringify(criterionComments) : null,
            gradingStatus,
        ]);
    },
    async completeAttempt(attemptId, score, maxScore, gradingStatus) {
        await db_1.pool.query(`UPDATE quiz_attempts
       SET score = ?, max_score = ?, grading_status = ?,
           completed_at = IF(? = 'completed', CURRENT_TIMESTAMP, NULL)
       WHERE attempt_id = ?`, [score, maxScore, gradingStatus, gradingStatus, attemptId]);
    },
    async getAttemptHistory(studentId) {
        const [rows] = await db_1.pool.query(`SELECT qa.attempt_id, qa.score, qa.max_score, qa.completed_at, qa.grading_status, q.title, s.subject_name
       FROM quiz_attempts qa
       JOIN quizzes q ON q.quiz_id = qa.quiz_id
       JOIN subjects s ON s.subject_id = q.subject_id
       WHERE qa.student_id = ?
       ORDER BY qa.started_at DESC`, [studentId]);
        return rows;
    },
};
