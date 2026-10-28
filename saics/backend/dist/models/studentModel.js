"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentModel = void 0;
const db_1 = require("../config/db");
exports.StudentModel = {
    async create(fullName, email, passwordHash) {
        const [result] = await db_1.pool.query(`INSERT INTO students (full_name, email, password_hash) VALUES (?, ?, ?)`, [fullName, email, passwordHash]);
        return result.insertId;
    },
    async findByEmail(email) {
        const [rows] = await db_1.pool.query(`SELECT * FROM students WHERE email = ? LIMIT 1`, [email]);
        return rows[0] || null;
    },
    async findById(studentId) {
        const [rows] = await db_1.pool.query(`SELECT student_id, full_name, email, role, bio, academic_year, avatar_color, avatar_url, created_at
       FROM students WHERE student_id = ? LIMIT 1`, [studentId]);
        return rows[0] || null;
    },
    async updateProfile(studentId, updates) {
        const fields = [];
        const values = [];
        if (updates.fullName !== undefined) {
            fields.push("full_name = ?");
            values.push(updates.fullName);
        }
        if (updates.bio !== undefined) {
            fields.push("bio = ?");
            values.push(updates.bio);
        }
        if (updates.academicYear !== undefined) {
            fields.push("academic_year = ?");
            values.push(updates.academicYear);
        }
        if (updates.avatarColor !== undefined) {
            fields.push("avatar_color = ?");
            values.push(updates.avatarColor);
        }
        if (updates.avatarUrl !== undefined) {
            fields.push("avatar_url = ?");
            values.push(updates.avatarUrl);
        }
        if (fields.length === 0)
            return false;
        values.push(studentId);
        const [result] = await db_1.pool.query(`UPDATE students SET ${fields.join(", ")} WHERE student_id = ?`, values);
        return result.affectedRows > 0;
    },
};
