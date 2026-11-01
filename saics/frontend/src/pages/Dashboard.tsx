import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, BookOpenCheck, Mic, Flame } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import { useStreak } from "../hooks/useStreak";
import { handleKeyActivation } from "../utils/a11y";

interface RiskAnalysis {
  level: "insufficient_data" | "low" | "medium" | "high";
  score?: number;
  reasons?: string[];
  suggestions?: string[];
}

export default function Dashboard() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const { data: streakData, loading: streakLoading } = useStreak(true);
  const [risk, setRisk] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState("");

  const loadRisk = useCallback(async () => {
    setRiskLoading(true);
    setRiskError("");
    try {
      const response = await api.get("/analytics/me");
      setRisk(response.data.analysis as RiskAnalysis);
    } catch (error) {
      const requestError = error as { response?: { data?: { message?: string } } };
      setRiskError(requestError.response?.data?.message ?? "Could not load your academic outlook.");
    } finally {
      setRiskLoading(false);
    }
  }, []);

  useEffect(() => { void loadRisk(); }, [loadRisk]);

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

      <section className="risk-outlook-card" aria-labelledby="risk-outlook-title">
        <div className="risk-outlook-heading">
          <div>
            <p className="greeting-eyebrow">Risk analysis</p>
            <h2 id="risk-outlook-title">Academic Outlook</h2>
          </div>
          {!riskLoading && !riskError && risk && (
            <span className={`risk-level-badge risk-level-${risk.level}`}>
              {risk.level === "insufficient_data" ? "Not enough data" : risk.level}
            </span>
          )}
        </div>
        {riskLoading ? <Spinner label="Loading academic outlook..." /> : riskError ? (
          <div className="risk-outlook-message" role="alert">
            <p>{riskError}</p><button className="secondary-btn" onClick={() => void loadRisk()}>Try again</button>
          </div>
        ) : risk?.level === "insufficient_data" ? (
          <p className="risk-outlook-message">Log at least three assessment results to see your explainable risk analysis.</p>
        ) : risk ? (
          <>
            <p className="risk-outlook-score"><strong>{risk.score}</strong><span> / 100 risk score</span></p>
            <div className="risk-outlook-columns">
              <div><h3>What we noticed</h3><ul>{risk.reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
              <div><h3>Suggested next steps</h3><ul>{risk.suggestions?.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div>
            </div>
          </>
        ) : <p className="risk-outlook-message">Risk analysis is not available yet.</p>}
      </section>

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
