"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectModel = void 0;
const db_1 = require("../config/db");
exports.SubjectModel = {
    async findAll() {
        const [rows] = await db_1.pool.query(`SELECT * FROM subjects ORDER BY subject_name ASC`);
        return rows;
    },
    async findByCode(subjectCode) {
        const [rows] = await db_1.pool.query(`SELECT * FROM subjects WHERE subject_code = ? LIMIT 1`, [subjectCode]);
        return rows[0] || null;
    },
    async findById(subjectId) {
        const [rows] = await db_1.pool.query(`SELECT * FROM subjects WHERE subject_id = ? LIMIT 1`, [subjectId]);
        return rows[0] || null;
    },
    async create(subjectName, subjectCode) {
        const [result] = await db_1.pool.query(`INSERT INTO subjects (subject_name, subject_code) VALUES (?, ?)`, [subjectName, subjectCode]);
        return result.insertId;
    },
    async listForStudent(studentId) {
        const [rows] = await db_1.pool.query(`SELECT s.* FROM subjects s
       JOIN student_subjects ss ON ss.subject_id = s.subject_id
       WHERE ss.student_id = ?
       ORDER BY s.subject_name ASC`, [studentId]);
        return rows;
    },
    async enroll(studentId, subjectId) {
        // Idempotent — enrolling twice in the same subject is a no-op, not an error.
        await db_1.pool.query(`INSERT IGNORE INTO student_subjects (student_id, subject_id) VALUES (?, ?)`, [studentId, subjectId]);
    },
    async unenroll(studentId, subjectId) {
        await db_1.pool.query(`DELETE FROM student_subjects WHERE student_id = ? AND subject_id = ?`, [studentId, subjectId]);
    },
};
