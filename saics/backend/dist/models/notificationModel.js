"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationModel = void 0;
const db_1 = require("../config/db");
exports.NotificationModel = {
    async create(studentId, message, type) {
        const [result] = await db_1.pool.query(`INSERT INTO notifications (student_id, message, type) VALUES (?, ?, ?)`, [studentId, message, type]);
        return result.insertId;
    },
    async listForStudent(studentId, limit = 20) {
        const [rows] = await db_1.pool.query(`SELECT * FROM notifications WHERE student_id = ?
       ORDER BY created_at DESC LIMIT ?`, [studentId, limit]);
        return rows;
    },
    async unreadCount(studentId) {
        const [rows] = await db_1.pool.query(`SELECT COUNT(*) as count FROM notifications WHERE student_id = ? AND is_read = FALSE`, [studentId]);
        return rows[0].count;
    },
    async markAsRead(notificationId, studentId) {
        const [result] = await db_1.pool.query(`UPDATE notifications SET is_read = TRUE
       WHERE notification_id = ? AND student_id = ?`, [notificationId, studentId]);
        return result.affectedRows > 0;
    },
    async markAllAsRead(studentId) {
        await db_1.pool.query(`UPDATE notifications SET is_read = TRUE WHERE student_id = ? AND is_read = FALSE`, [studentId]);
    },
};
