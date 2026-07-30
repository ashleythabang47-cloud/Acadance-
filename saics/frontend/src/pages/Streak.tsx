import { Flame, Trophy, CalendarCheck } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import { useStreak } from "../hooks/useStreak";

const dayLabel = (dateStr: string) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });

export default function Streak() {
  const { data, loading } = useStreak(false);

  const bars =
    data?.last7Days.map((d) => ({
      date: d.date,
      count: d.count,
      height: d.count === 0 ? 8 : Math.min(100, 30 + d.count * 25),
    })) || [];

  return (
    <AppLayout>
      <header className="topbar">
        <div>
          <p className="greeting-eyebrow">Gamification</p>
          <h1>Your streak</h1>
        </div>
      </header>

      {loading ? (
        <Spinner label="Loading your streak..." />
      ) : (
        <>
          <div className="streak-summary-grid">
            <div className="card">
              <div className="card-icon-badge card-icon-amber"><Flame size={18} /></div>
              <p className="stat-label">Current streak</p>
              <p className="stat-value mono">{data?.streak.current_streak ?? 0} days</p>
            </div>
            <div className="card">
              <div className="card-icon-badge"><Trophy size={18} /></div>
              <p className="stat-label">Longest streak</p>
              <p className="stat-value mono">{data?.streak.longest_streak ?? 0} days</p>
            </div>
            <div className="card">
              <div className="card-icon-badge"><CalendarCheck size={18} /></div>
              <p className="stat-label">Last active</p>
              <p className="stat-value mono">{data?.streak.last_activity_date ?? "—"}</p>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h3>Last 7 days</h3>
            <div className="cadence-bars streak-history-bars">
              {bars.map((b, i) => (
                <div key={i} className="streak-day">
                  <div className="bar" style={{ height: `${b.height}%` }} />
                  <span className="day-label mono">{dayLabel(b.date)}</span>
                </div>
              ))}
            </div>
            <p className="streak-explainer">
              Bars grow taller the more you log in a single day — logging in, adding a
              result, taking a quiz, or joining a study session all count. Miss a day and
              the streak resets to 1 the next time you're active.
            </p>
          </div>
        </>
      )}
    </AppLayout>
  );
}
