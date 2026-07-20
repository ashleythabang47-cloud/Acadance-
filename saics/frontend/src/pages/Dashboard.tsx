import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { useStreak } from "../hooks/useStreak";

export default function Dashboard() {
  const { student, logout } = useAuth();
  const navigate = useNavigate();
  const { data: streakData, loading: streakLoading } = useStreak(true);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Scale each day's raw activity count into a bar height percentage.
  // Capped so a handful of actions in one day still reads as "full".
  const bars = streakData?.last7Days.map((d) => ({
    date: d.date,
    height: d.count === 0 ? 8 : Math.min(100, 30 + d.count * 25),
  })) || [];

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-content">
        <header className="topbar">
          <div>
            <p className="greeting-eyebrow">Dashboard</p>
            <h1>Hi, {student?.fullName?.split(" ")[0]} 👋</h1>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <div className="card-grid">
          <div className="card" onClick={() => navigate("/performance")} role="button">
            <h3>Performance</h3>
            <p>Track your test and assignment scores here.</p>
            <span className="placeholder-tag">View</span>
          </div>

          <div className="card">
            <h3>Quizzes</h3>
            <p>AI-generated quizzes based on your study material.</p>
            <span className="placeholder-tag">Coming soon</span>
          </div>

          <div className="card">
            <h3>Study Sessions</h3>
            <p>Join voice-based collaborative study rooms.</p>
            <span className="placeholder-tag">Coming soon</span>
          </div>

          <div
            className="card streak-card"
            onClick={() => navigate("/streak")}
            role="button"
          >
            <h3>Streak</h3>
            {streakLoading ? (
              <p>Loading...</p>
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
      </div>
    </div>
  );
}
