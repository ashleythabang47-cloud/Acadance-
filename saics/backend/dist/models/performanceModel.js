"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceModel = void 0;
const db_1 = require("../config/db");
exports.PerformanceModel = {
    // Joins subjects so the frontend gets the subject name without a second call.
    async findByStudent(studentId) {
        const [rows] = await db_1.pool.query(`SELECT pr.*, s.subject_name
       FROM performance_records pr
       JOIN subjects s ON s.subject_id = pr.subject_id
       WHERE pr.student_id = ?
       ORDER BY pr.assessment_date DESC, pr.record_id DESC`, [studentId]);
        return rows;
    },
    async findOne(recordId, studentId) {
        const [rows] = await db_1.pool.query(`SELECT * FROM performance_records WHERE record_id = ? AND student_id = ? LIMIT 1`, [recordId, studentId]);
        return rows[0] || null;
    },
    async create(record) {
        const [result] = await db_1.pool.query(`INSERT INTO performance_records
        (student_id, subject_id, assessment_name, score, max_score, assessment_date)
       VALUES (?, ?, ?, ?, ?, ?)`, [
            record.studentId,
            record.subjectId,
            record.assessmentName,
            record.score,
            record.maxScore,
            record.assessmentDate,
        ]);
        return result.insertId;
    },
    async update(recordId, studentId, updates) {
        const fields = [];
        const values = [];
        if (updates.assessmentName !== undefined) {
            fields.push("assessment_name = ?");
            values.push(updates.assessmentName);
        }
        if (updates.score !== undefined) {
            fields.push("score = ?");
            values.push(updates.score);
        }
        if (updates.maxScore !== undefined) {
            fields.push("max_score = ?");
            values.push(updates.maxScore);
        }
        if (updates.assessmentDate !== undefined) {
            fields.push("assessment_date = ?");
            values.push(updates.assessmentDate);
        }
        if (updates.subjectId !== undefined) {
            fields.push("subject_id = ?");
            values.push(updates.subjectId);
        }
        if (fields.length === 0)
            return false;
        values.push(recordId, studentId);
        const [result] = await db_1.pool.query(`UPDATE performance_records SET ${fields.join(", ")}
       WHERE record_id = ? AND student_id = ?`, values);
        return result.affectedRows > 0;
    },
    async delete(recordId, studentId) {
        const [result] = await db_1.pool.query(`DELETE FROM performance_records WHERE record_id = ? AND student_id = ?`, [recordId, studentId]);
        return result.affectedRows > 0;
    },
};
