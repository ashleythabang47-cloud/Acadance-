import { useNavigate } from "react-router-dom";
import { LineChart, BookOpenCheck, Mic, Flame } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import { useStreak } from "../hooks/useStreak";
import { handleKeyActivation } from "../utils/a11y";

export default function Dashboard() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const { data: streakData, loading: streakLoading } = useStreak(true);

  // Scale each day's raw activity count into a bar height percentage.
  // Capped so a handful of actions in one day still reads as "full".
  const bars = streakData?.last7Days.map((d) => ({
    date: d.date,
    height: d.count === 0 ? 8 : Math.min(100, 30 + d.count * 25),
  })) || [];

  return (
    <AppLayout>
      <header className="topbar">
        <div>
          <p className="greeting-eyebrow">Dashboard</p>
          <h1>Hi, {student?.fullName?.split(" ")[0]} 👋</h1>
        </div>
      </header>

      <div className="card-grid">
        <div
          className="card"
          onClick={() => navigate("/performance")}
          onKeyDown={handleKeyActivation(() => navigate("/performance"))}
          role="button"
          tabIndex={0}
        >
          <div className="card-icon-badge"><LineChart size={18} /></div>
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
                {streakData?.streak.current_streak ?? 0}
                <span>day streak</span>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
