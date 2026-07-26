import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { NotificationModel } from "../models/notificationModel";

export async function listMyNotifications(req: AuthRequest, res: Response) {
  try {
    const [notifications, unreadCount] = await Promise.all([
      NotificationModel.listForStudent(req.studentId!),
      NotificationModel.unreadCount(req.studentId!),
    ]);
    return res.status(200).json({ notifications, unreadCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching notifications." });
  }
}

export async function markNotificationRead(req: AuthRequest, res: Response) {
  try {
    const notificationId = Number(req.params.id);
    const updated = await NotificationModel.markAsRead(notificationId, req.studentId!);
    if (!updated) {
      return res.status(404).json({ message: "Notification not found." });
    }
    return res.status(200).json({ message: "Marked as read." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error updating notification." });
  }
}

export async function markAllNotificationsRead(req: AuthRequest, res: Response) {
  try {
    await NotificationModel.markAllAsRead(req.studentId!);
    return res.status(200).json({ message: "All notifications marked as read." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error updating notifications." });
  }
}
