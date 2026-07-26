import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

export interface Notification {
  notification_id: number;
  message: string;
  type: "alert" | "reminder" | "suggestion";
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function markAsRead(notificationId: number) {
    // Optimistic update — the panel feels instant rather than waiting on a round-trip.
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.post(`/notifications/${notificationId}/read`);
    } catch (err) {
      console.error("Failed to mark notification as read", err);
      refresh(); // fall back to the real server state if the request failed
    }
  }

  async function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.post("/notifications/read-all");
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
      refresh();
    }
  }

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh };
}
