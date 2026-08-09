import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import {
  LineChart as LineChartIcon,
  BookOpenCheck,
  Mic,
  Flame,
  Target,
  Trophy,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import { useStreak } from "../hooks/useStreak";
import { handleKeyActivation } from "../utils/a11y";

interface PerformanceRecord {
  record_id: number;
  score: number;
  max_score: number;
  assessment_date: string;
}

interface QuizHistoryEntry {
  attempt_id: number;
  score: number;
  max_score: number;
}

export default function Dashboard() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const { data: streakData, loading: streakLoading } = useStreak(true);

  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryEntry[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [perfRes, quizRes] = await Promise.all([
          api.get("/performance"),
          api.get("/quizzes/history/me"),
        ]);
        setRecords(perfRes.data.records);
        setQuizHistory(quizRes.data.history);
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, []);

  // Scale each day's raw activity count into a bar height percentage.
  // Capped so a handful of actions in one day still reads as "full".
  const bars = streakData?.last7Days.map((d) => ({
    date: d.date,
    height: d.count === 0 ? 8 : Math.min(100, 30 + d.count * 25),
  })) || [];

  const avgPerformance =
    records.length > 0
      ? Math.round(
          records.reduce((sum, r) => sum + (r.score / r.max_score) * 100, 0) / records.length
        )
      : null;

  const avgQuizScore =
    quizHistory.length > 0
      ? Math.round(
          quizHistory.reduce((sum, q) => sum + (q.score / q.max_score) * 100, 0) /
            quizHistory.length
        )
      : null;

  // Oldest-first, last 8 results, for a small trend line.
  const trendData = [...records]
    .sort((a, b) => a.assessment_date.localeCompare(b.assessment_date))
    .slice(-8)
    .map((r) => ({ percentage: Math.round((r.score / r.max_score) * 100) }));

  const currentStreak = streakData?.streak.current_streak ?? 0;

  // A short, honest message that actually reflects what's happening,
  // rather than generic praise regardless of activity.
  function getEncouragement(): string {
    if (records.length === 0 && quizHistory.length === 0) {
      return "Log your first result or take a quiz to start tracking your progress.";
    }
    if (currentStreak >= 3) {
      return `You're on a ${currentStreak}-day streak — keep the momentum going.`;
    }
    if (avgPerformance !== null && avgPerformance < 50) {
      return "Recent scores have been tough — a quick quiz review could help.";
    }
    if (avgPerformance !== null && avgPerformance >= 75) {
      return "Strong results lately — nice work.";
    }
    return "Every session adds up. Keep going.";
  }

  return (
    <AppLayout>
      <header className="topbar">
        <div>
          <p className="greeting-eyebrow">Dashboard</p>
          <h1>Hi, {student?.fullName?.split(" ")[0]} 👋</h1>
          <p className="dashboard-encouragement">{getEncouragement()}</p>
        </div>
      </header>

      {/* Quick stats — real numbers, not decoration */}
      <div className="streak-summary-grid dashboard-stats-grid">
        <div className="card">
          <div className="card-icon-badge"><Target size={18} /></div>
          <p className="stat-label">Average score</p>
          <p className="stat-value mono">{avgPerformance !== null ? `${avgPerformance}%` : "—"}</p>
        </div>
        <div className="card">
          <div className="card-icon-badge card-icon-violet"><Trophy size={18} /></div>
          <p className="stat-label">Quiz average</p>
          <p className="stat-value mono">{avgQuizScore !== null ? `${avgQuizScore}%` : "—"}</p>
        </div>
        <div className="card">
          <div className="card-icon-badge card-icon-amber"><Flame size={18} /></div>
          <p className="stat-label">Current streak</p>
          <p className="stat-value mono">{currentStreak} days</p>
        </div>
        <div className="card">
          <div className="card-icon-badge card-icon-blue"><ClipboardList size={18} /></div>
          <p className="stat-label">Results logged</p>
          <p className="stat-value mono">{records.length}</p>
        </div>
      </div>

      {/* Trend sparkline — only shown once there's enough data to trend */}
      {!statsLoading && trendData.length >= 2 && (
        <div className="card dashboard-trend-card">
          <p className="stat-label">Recent performance trend</p>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={trendData}>
              <YAxis domain={[0, 100]} hide />
              <Line
                type="monotone"
                dataKey="percentage"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card-grid">
        <div
          className="card"
          onClick={() => navigate("/performance")}
          onKeyDown={handleKeyActivation(() => navigate("/performance"))}
          role="button"
          tabIndex={0}
        >
          <div className="card-icon-badge"><LineChartIcon size={18} /></div>
          <h3>Performance</h3>
          <p>Track your test and assignment scores here.</p>
          <span className="placeholder-tag">View</span>
        </div>

        <div
          className="card"
          onClick={() => navigate("/quizzes")}
          onKeyDown={handleKeyActivation(() => navigate("/quizzes"))}
          role="button"
          tabIndex={0}
        >
          <div className="card-icon-badge card-icon-violet"><BookOpenCheck size={18} /></div>
          <h3>Quizzes</h3>
          <p>AI-generated quizzes based on your study material.</p>
          <span className="placeholder-tag">View</span>
        </div>

        <div
          className="card"
          onClick={() => navigate("/study-sessions")}
          onKeyDown={handleKeyActivation(() => navigate("/study-sessions"))}
          role="button"
          tabIndex={0}
        >
          <div className="card-icon-badge card-icon-blue"><Mic size={18} /></div>
          <h3>Study Sessions</h3>
          <p>Join voice-based collaborative study rooms.</p>
          <span className="placeholder-tag">View</span>
        </div>

        <div
          className="card streak-card"
          onClick={() => navigate("/streak")}
          onKeyDown={handleKeyActivation(() => navigate("/streak"))}
          role="button"
          tabIndex={0}
        >
          <div className="card-icon-badge card-icon-amber"><Flame size={18} /></div>
          <h3>Streak</h3>
          {streakLoading ? (
            <Spinner />
          ) : (
            <>
              <div className="cadence-bars">
                {bars.map((b, i) => (
                  <div key={i} className="bar" style={{ height: `${b.height}%` }} />
                ))}
              </div>
              <div className="streak-count">
                {currentStreak}
                <span>day streak</span>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
