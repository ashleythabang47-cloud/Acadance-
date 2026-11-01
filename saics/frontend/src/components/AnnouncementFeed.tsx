import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { api } from "../api/client";

interface Announcement {
  id?: number | string;
  announcementId?: number | string;
  title?: string;
  message?: string;
  body?: string;
  content?: string;
  createdAt?: string;
  created_at?: string;
}

function getAnnouncements(data: unknown): Announcement[] {
  if (Array.isArray(data)) return data as Announcement[];
  if (!data || typeof data !== "object") return [];
  const response = data as { announcements?: unknown; data?: unknown };
  if (Array.isArray(response.announcements)) return response.announcements as Announcement[];
  if (Array.isArray(response.data)) return response.data as Announcement[];
  return [];
}

export default function AnnouncementFeed() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await api.get("/announcements");
        if (active) setAnnouncements(getAnnouncements(response.data));
      } catch {
        if (active) setError("Announcements are temporarily unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    }
    const refresh = () => { void load(); };
    void load();
    window.addEventListener("acadance:announcements-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("acadance:announcements-updated", refresh);
    };
  }, []);

  const visible = announcements.filter((announcement, index) => {
    const id = String(announcement.id ?? announcement.announcementId ?? index);
    return !dismissed.includes(id);
  });

  if (loading) return <div className="announcement-feed loading" role="status">Loading announcements…</div>;
  if (error) return <div className="announcement-feed error" role="status">{error}</div>;
  if (!visible.length) return null;

  return (
    <section className="announcement-feed" aria-label="Platform announcements">
      {visible.map((announcement, index) => {
        const id = String(announcement.id ?? announcement.announcementId ?? index);
        const dateValue = announcement.createdAt ?? announcement.created_at;
        const date = dateValue ? new Date(dateValue) : null;
        return (
          <article className="announcement-feed-item" key={id}>
            <span className="announcement-feed-icon"><Megaphone size={16} /></span>
            <div className="announcement-feed-copy">
              <strong>{announcement.title || "Announcement"}</strong>
              <p>{announcement.message ?? announcement.body ?? announcement.content ?? ""}</p>
            </div>
            {date && !Number.isNaN(date.getTime()) && <time>{date.toLocaleDateString()}</time>}
            <button type="button" onClick={() => setDismissed((current) => [...current, id])} aria-label={`Dismiss ${announcement.title || "announcement"}`}><X size={15} /></button>
          </article>
        );
      })}
    </section>
  );
}
