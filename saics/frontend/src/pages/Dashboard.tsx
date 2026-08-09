import { useEffect, useMemo, useState } from "react";
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
  ClipboardList,
  ArrowRight,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import CircularProgress from "../components/CircularProgress";
import { useStreak } from "../hooks/useStreak";
import { handleKeyActivation } from "../utils/a11y";

interface PerformanceRecord {
  record_id: number;
  subject_name: string;
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

  const bars = streakData?.last7Days.map((d) => ({
    date: d.date,
    height: d.count === 0 ? 8 : Math.min(100, 30 + d.count * 25),
    active: d.count > 0,
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

  const trendData = [...records]
    .sort((a, b) => a.assessment_date.localeCompare(b.assessment_date))
    .slice(-8)
    .map((r) => ({ percentage: Math.round((r.score / r.max_score) * 100) }));

  // Group results by subject to surface where a student is strongest /
  // weakest — the Quizlet-style "mastery per topic" pattern.
  const subjectMastery = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();
    for (const r of records) {
      const pct = (r.score / r.max_score) * 100;
      const entry = grouped.get(r.subject_name) || { total: 0, count: 0 };
      entry.total += pct;
      entry.count += 1;
      grouped.set(r.subject_name, entry);
    }
    return Array.from(grouped.entries())
      .map(([subject, { total, count }]) => ({ subject, average: Math.round(total / count) }))
      .sort((a, b) => a.average - b.average)
      .slice(0, 5);
  }, [records]);

  const currentStreak = streakData?.streak.current_streak ?? 0;
  const weakestSubject = subjectMastery[0];

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

  // A single, prominent "what should I do next" card — driven by real
  // data rather than a generic static prompt.
  function getContinueCard() {
    if (records.length === 0 && quizHistory.length === 0) {
      return {
        title: "Let's get started",
        body: "Log your first result to start tracking your progress across subjects.",
        cta: "Add a result",
        icon: Sparkles,
        onClick: () => navigate("/performance"),
      };
    }
    if (weakestSubject && weakestSubject.average < 65) {
      return {
        title: `Focus area: ${weakestSubject.subject}`,
        body: `Your average here is ${weakestSubject.average}% — a quiz on this subject could help close the gap.`,
        cta: "Take a quiz",
        icon: Target,
        onClick: () => navigate("/quizzes"),
      };
    }
    return {
      title: "Keep the streak alive",
      body: "You're doing well across the board — take a quiz or log today's result to stay on track.",
      cta: "Take a quiz",
      icon: Sparkles,
      onClick: () => navigate("/quizzes"),
    };
  }

  const continueCard = getContinueCard();
  const ContinueIcon = continueCard.icon;

  return (
    <AppLayout>
      <header className="topbar">
        <div>
          <p className="greeting-eyebrow">Dashboard</p>
          <h1>Hi, {student?.fullName?.split(" ")[0]} 👋</h1>
          <p className="dashboard-encouragement">{getEncouragement()}</p>
        </div>
      </header>

      {!statsLoading && (
        <div
          className="continue-card"
          onClick={continueCard.onClick}
          onKeyDown={handleKeyActivation(continueCard.onClick)}
          role="button"
          tabIndex={0}
        >
          <div className="continue-card-icon"><ContinueIcon size={22} /></div>
          <div className="continue-card-text">
            <p className="continue-card-title">{continueCard.title}</p>
            <p className="continue-card-body">{continueCard.body}</p>
          </div>
          <button className="continue-card-btn" tabIndex={-1}>
            {continueCard.cta}
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      <div className="dashboard-rings-row">
        <div className="card ring-card">
          <CircularProgress value={avgPerformance ?? 0} color="var(--primary)" />
          <p className="stat-label">Average score</p>
        </div>
        <div className="card ring-card">
          <CircularProgress value={avgQuizScore ?? 0} color="var(--violet)" />
          <p className="stat-label">Quiz average</p>
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

      <div className="dashboard-two-col">
        {!statsLoading && trendData.length >= 2 && (
          <div className="card dashboard-trend-card">
            <p className="stat-label">Recent performance trend</p>
            <ResponsiveContainer width="100%" height={90}>
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

        {subjectMastery.length > 0 && (
          <div className="card">
            <p className="stat-label">Mastery by subject</p>
            <div className="mastery-list">
              {subjectMastery.map((s) => (
                <div key={s.subject} className="mastery-row">
                  <div className="mastery-row-header">
                    <span>{s.subject}</span>
                    <span className="mono">{s.average}%</span>
                  </div>
                  <div className="mastery-bar-track">
                    <div
                      className="mastery-bar-fill"
                      style={{
                        width: `${s.average}%`,
                        background:
                          s.average < 50
                            ? "var(--brick)"
                            : s.average < 75
                            ? "var(--amber)"
                            : "var(--success)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
              <div className="heatmap-row">
                {bars.map((b, i) => (
                  <div
                    key={i}
                    className={`heatmap-square ${b.active ? "active" : ""}`}
                    style={b.active ? { opacity: Math.max(0.35, b.height / 100) } : undefined}
                  />
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
