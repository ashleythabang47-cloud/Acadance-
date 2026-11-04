import { Flame, Trophy, CalendarCheck, Medal, Lock, Activity, CalendarRange } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import PageHeader from "../components/ui/PageHeader";
import StatTile from "../components/ui/StatTile";
import ActivityHeatmap from "../components/ui/ActivityHeatmap";
import { useStreak } from "../hooks/useStreak";
import { formatLongDate, todayKey, toDateKey } from "../utils/academics";

const HISTORY_DAYS = 182; // ~26 weeks

const dayLabel = (dateStr: string) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });

const MILESTONES = [
  { days: 3, name: "Warm-up", blurb: "3 days in a row" },
  { days: 7, name: "One week", blurb: "A full week of study" },
  { days: 14, name: "Fortnight", blurb: "Two weeks strong" },
  { days: 30, name: "Habit formed", blurb: "30-day rhythm" },
  { days: 60, name: "Unstoppable", blurb: "60 days of momentum" },
  { days: 100, name: "Centurion", blurb: "100-day legend" },
];

export default function Streak() {
  const { data, loading } = useStreak(false, HISTORY_DAYS);

  const current = data?.streak.current_streak ?? 0;
  const longest = data?.streak.longest_streak ?? 0;
  const lastActive = data?.streak.last_activity_date ? toDateKey(data.streak.last_activity_date) : null;
  const activeToday = lastActive === todayKey() || (data?.last7Days.at(-1)?.count ?? 0) > 0;
  const history = data?.activity ?? data?.last7Days ?? [];
  const activeDays30 = history.slice(-30).filter((d) => d.count > 0).length;
  const next = MILESTONES.find((m) => m.days > current);
  const prevMilestone = [...MILESTONES].reverse().find((m) => m.days <= current)?.days ?? 0;
  const toNext = next ? next.days - current : 0;
  const nextProgress = next ? ((current - prevMilestone) / (next.days - prevMilestone)) * 100 : 100;

  const maxCount = Math.max(1, ...(data?.last7Days.map((d) => d.count) ?? [1]));
  const bars =
    data?.last7Days.map((d) => ({
      date: d.date,
      count: d.count,
      height: d.count === 0 ? 6 : Math.max(18, (d.count / maxCount) * 100),
    })) || [];

  return (
    <AppLayout>
      <PageHeader eyebrow="Gamification" title="Your streak" subtitle="Consistency beats intensity. Show up a little every day." />

      {loading ? (
        <Spinner label="Loading your streak..." />
      ) : (
        <>
          <section className="streak-hero">
            <div className={`streak-flame-big ${current > 0 ? "lit" : ""}`} aria-hidden="true">
              <Flame size={46} />
            </div>
            <div className="streak-hero-copy">
              <p className="streak-hero-num"><span className="mono">{current}</span> day{current === 1 ? "" : "s"}</p>
              <p className="streak-hero-sub">
                {current === 0
                  ? "Start a new streak today — log in, add a result, take a quiz, or finish a focus block."
                  : activeToday
                    ? "You've already shown up today. See you tomorrow!"
                    : "Do anything today to keep your streak alive."}
              </p>
              {next && (
                <div className="milestone-progress">
                  <div className="milestone-progress-label">
                    <span>Next: <strong>{next.name}</strong></span>
                    <span className="mono">{toNext} day{toNext === 1 ? "" : "s"} to go</span>
                  </div>
                  <div className="milestone-track"><span style={{ width: `${Math.max(4, nextProgress)}%` }} /></div>
                </div>
              )}
            </div>
          </section>

          <div className="streak-summary-grid stat-grid">
            <StatTile icon={Flame} label="Current streak" value={current} unit={current === 1 ? " day" : " days"} accent="amber" />
            <StatTile icon={Trophy} label="Longest streak" value={longest} unit={longest === 1 ? " day" : " days"} accent="indigo" />
            <StatTile icon={CalendarCheck} label="Last active" value={lastActive ? formatLongDate(lastActive) : "—"} accent="teal" />
            <StatTile icon={Activity} label="Active days" value={activeDays30} hint="in the last 30 days" accent="violet" />
          </div>

          <div className="card chart-card" style={{ marginTop: 20 }}>
            <div className="card-head">
              <div>
                <h3><CalendarRange size={16} className="inline-icon" /> Activity heatmap</h3>
                <p className="card-sub">Your last {Math.round(history.length / 7)} weeks — darker squares mean busier days. Hover a day for details.</p>
              </div>
            </div>
            {history.length ? <ActivityHeatmap days={history} /> : <p className="card-sub">No activity recorded yet.</p>}
          </div>

          <div className="streak-two-col">
            <div className="card">
              <h3>Last 7 days</h3>
              <div className="cadence-bars streak-history-bars">
                {bars.map((b, i) => (
                  <div key={i} className="streak-day" title={`${b.date}: ${b.count} ${b.count === 1 ? "activity" : "activities"}`}>
                    <span className="day-count mono">{b.count || ""}</span>
                    <div className={`bar ${b.count ? "on" : ""} ${i === bars.length - 1 ? "today" : ""}`} style={{ height: `${b.height}%` }} />
                    <span className="day-label mono">{i === bars.length - 1 ? "Today" : dayLabel(b.date)}</span>
                  </div>
                ))}
              </div>
              <p className="streak-explainer">
                Bars grow taller the more you log in a single day — logging in, adding a
                result, taking a quiz, or joining a study session all count. Miss a day and
                the streak resets to 1 the next time you're active.
              </p>
            </div>

            <div className="card">
              <h3>Milestones</h3>
              <p className="card-sub">Unlocked by your longest streak.</p>
              <ul className="milestone-grid">
                {MILESTONES.map((m) => {
                  const unlocked = longest >= m.days;
                  return (
                    <li key={m.days} className={`milestone ${unlocked ? "unlocked" : ""}`} title={unlocked ? `Unlocked: ${m.blurb}` : `Locked: reach a ${m.days}-day streak`}>
                      <span className="milestone-badge">{unlocked ? <Medal size={18} /> : <Lock size={15} />}</span>
                      <strong>{m.name}</strong>
                      <small>{m.blurb}</small>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
