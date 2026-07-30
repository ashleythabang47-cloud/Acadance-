import { useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, Clock, Lightbulb, CheckCheck } from "lucide-react";
import { useNotifications } from "../hooks/useNotifications";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import EmptyState from "./EmptyState";

const TYPE_ICON = {
  alert: AlertTriangle,
  reminder: Clock,
  suggestion: Lightbulb,
} as const;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  // Close the panel when clicking anywhere outside it, or pressing Escape.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="notification-bell-wrapper" ref={panelRef}>
      <button
        className="notification-bell-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-panel" role="menu">
          <div className="notification-panel-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button className="mark-all-read-btn" onClick={markAllAsRead} role="menuitem">
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <p className="notification-loading">Loading...</p>
            ) : notifications.length === 0 ? (
              <EmptyState icon={Bell} message="No notifications yet." />
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type];
                return (
                  <button
                    key={n.notification_id}
                    className={`notification-item ${n.type} ${n.is_read ? "read" : "unread"}`}
                    onClick={() => !n.is_read && markAsRead(n.notification_id)}
                    role="menuitem"
                  >
                    <Icon size={15} className="notification-item-icon" />
                    <div>
                      <p className="notification-message">{n.message}</p>
                      <p className="notification-time">{formatRelativeTime(n.created_at)}</p>
                    </div>
                    {!n.is_read && <span className="unread-dot" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
