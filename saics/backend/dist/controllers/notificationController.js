"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMyNotifications = listMyNotifications;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
const notificationModel_1 = require("../models/notificationModel");
async function listMyNotifications(req, res) {
    try {
        const [notifications, unreadCount] = await Promise.all([
            notificationModel_1.NotificationModel.listForStudent(req.studentId),
            notificationModel_1.NotificationModel.unreadCount(req.studentId),
        ]);
        return res.status(200).json({ notifications, unreadCount });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching notifications." });
    }
}
async function markNotificationRead(req, res) {
    try {
        const notificationId = Number(req.params.id);
        const updated = await notificationModel_1.NotificationModel.markAsRead(notificationId, req.studentId);
        if (!updated) {
            return res.status(404).json({ message: "Notification not found." });
        }
        return res.status(200).json({ message: "Marked as read." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error updating notification." });
    }
}
async function markAllNotificationsRead(req, res) {
    try {
        await notificationModel_1.NotificationModel.markAllAsRead(req.studentId);
        return res.status(200).json({ message: "All notifications marked as read." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error updating notifications." });
    }
}
