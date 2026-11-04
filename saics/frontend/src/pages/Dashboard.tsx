import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  LineChart as LineChartIcon,
  BookOpenCheck,
  Mic,
  Flame,
  Target,
  ClipboardList,
  Sparkles,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ChevronDown,
  RefreshCw,
  Trophy,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";
import { api } from "../api/client";
import { useStreak } from "../hooks/useStreak";
import { useChartTheme } from "../hooks/useChartTheme";
import { handleKeyActivation } from "../utils/a11y";
import StatTile from "../components/ui/StatTile";
import ProgressRing from "../components/ui/ProgressRing";
import ChartTooltip from "../components/ui/ChartTooltip";
import { SkeletonChart, SkeletonRows, SkeletonBlock } from "../components/ui/Skeleton";
import EmptyState from "../components/EmptyState";
import {
  percentOf,
  average,
  trendSlope,
  summariseBySubject,
  toDateKey,
  formatShortDate,
  greetingFor,
  gradeFor,
} from "../utils/academics";

interface RiskAnalysis {
  level: "insufficient_data" | "low" | "medium" | "high";
  score?: number;
  reasons?: string[];
  suggestions?: string[];
}

interface PerformanceRecord {
  record_id: number;
  subject_name: string;
  assessment_name: string;
  score: number;
  max_score: number;
  assessment_date: string;
  source?: "manual" | "quiz";
}

interface QuizAttempt {
  attempt_id: number;
  score: number | null;
  max_score: number | null;
  completed_at: string | null;
  grading_status: string;
  title: string;
  subject_name: string;
}

const RISK_COPY = {
  low: { label: "Low risk", icon: ShieldCheck, blurb: "You're on solid ground. Keep the rhythm going." },
  medium: { label: "Medium risk", icon: ShieldAlert, blurb: "A few signals need attention — small changes now go a long way." },
  high: { label: "High risk", icon: ShieldAlert, blurb: "Let's turn this around. Start with the suggested steps below." },
  insufficient_data: { label: "Not enough data", icon: ShieldQuestion, blurb: "Log at least three assessment results to see your explainable risk analysis." },
} as const;

export default function Dashboard() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const chart = useChartTheme();
  const { data: streakData, loading: streakLoading } = useStreak(true);

  const [risk, setRisk] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState("");
  const [showRiskDetail, setShowRiskDetail] = useState(false);

  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

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

  useEffect(() => {
    let active = true;
    // Each source loads independently so one failing doesn't blank the page.
    Promise.allSettled([api.get("/performance"), api.get("/quizzes/history/me")]).then(([perf, hist]) => {
      if (!active) return;
      if (perf.status === "fulfilled") setRecords(perf.value.data.records ?? []);
      if (hist.status === "fulfilled") setAttempts(hist.value.data.history ?? []);
      setDataLoading(false);
    });
    return () => { active = false; };
  }, []);

  // ---------- Derived numbers ----------
  const chronological = useMemo(
    () =>
      records
        .map((r) => ({ ...r, pct: percentOf(r), key: toDateKey(r.assessment_date) }))
        .filter((r): r is typeof r & { pct: number } => r.pct !== null)
        .sort((a, b) => a.key.localeCompare(b.key) || a.record_id - b.record_id),
    [records]
  );
  const percents = chronological.map((r) => r.pct);
  const overallAvg = average(percents);
  const recent = percents.slice(-3);
  const previous = percents.slice(-6, -3);
  const momentum = recent.length && previous.length ? (average(recent)! - average(previous)!) : null;

  const gradedAttempts = attempts.filter((a) => a.grading_status === "completed" && a.score !== null && a.max_score);
  const quizAvg = average(gradedAttempts.map((a) => percentOf(a)!).filter((n) => n !== null));
  const thisMonth = toDateKey(new Date().toISOString()).slice(0, 7);
  const monthCount = chronological.filter((r) => r.key.startsWith(thisMonth)).length;

  const trendData = chronological.slice(-14).map((r) => ({
    date: formatShortDate(r.key),
    pct: r.pct,
    label: `${r.subject_name} — ${r.assessment_name}`,
  }));
  const subjects = summariseBySubject(records).slice(0, 6);
  const slope = trendSlope(percents.slice(-8));

  const activity = useMemo(() => {
    const items = [
      ...records.map((r) => ({
        id: `r-${r.record_id}`,
        kind: r.source === "quiz" ? ("quiz" as const) : ("result" as const),
        title: r.assessment_name,
        meta: r.subject_name,
        pct: percentOf(r),
        when: toDateKey(r.assessment_date),
      })),
      ...attempts
        .filter((a) => a.grading_status !== "completed")
        .map((a) => ({
          id: `a-${a.attempt_id}`,
          kind: "pending" as const,
          title: a.title,
          meta: `${a.subject_name} · grading pending`,
          pct: null,
          when: toDateKey(a.completed_at),
        })),
    ];
    return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 6);
  }, [records, attempts]);

  const currentStreak = streakData?.streak.current_streak ?? 0;
  const longestStreak = streakData?.streak.longest_streak ?? 0;
  const bars = streakData?.last7Days.map((d) => ({
    date: d.date,
    count: d.count,
    height: d.count === 0 ? 10 : Math.min(100, 30 + d.count * 25),
  })) || [];

  const firstName = student?.fullName?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const heroLine = (() => {
    if (dataLoading) return "Pulling together your latest progress…";
    if (!records.length) return "Log your first result or generate a quiz — your dashboard comes alive as you go.";
    if (momentum !== null && momentum >= 2) return `You're trending up — your last three results are ${momentum.toFixed(1)} points above the three before.`;
    if (momentum !== null && momentum <= -2) return `Your last few results dipped ${Math.abs(momentum).toFixed(1)} points. A focused quiz could help you bounce back.`;
    if (currentStreak >= 3) return `${currentStreak} days in a row — that's a real study rhythm. Keep it alive today.`;
    return `You've logged ${records.length} result${records.length === 1 ? "" : "s"} so far. Every entry sharpens your insights.`;
  })();

  const riskColor =
    risk?.level === "low" ? chart.status.good : risk?.level === "medium" ? chart.status.warning : chart.status.critical;
  const riskCopy = RISK_COPY[risk?.level ?? "insufficient_data"];
  const RiskIcon = riskCopy.icon;

  const modules = [
    { path: "/performance", icon: LineChartIcon, title: "Performance", text: "Track your test and assignment scores.", accent: "indigo" },
    { path: "/quizzes", icon: BookOpenCheck, title: "Quizzes", text: "AI-generated quizzes from your study material.", accent: "violet" },
    { path: "/study-sessions", icon: Mic, title: "Study Sessions", text: "Join voice-based collaborative study rooms.", accent: "blue" },
    { path: "/streak", icon: Flame, title: "Streak", text: "Your activity heatmap and milestones.", accent: "amber" },
  ] as const;

  return (
    <AppLayout>
      {/* ---------- Hero ---------- */}
      <section className="dash-hero">
        <div className="dash-hero-copy">
          <p className="greeting-eyebrow"><CalendarDays size={13} /> {today}</p>
          <h1>{greetingFor()}, {firstName} <span className="wave" aria-hidden="true">👋</span></h1>
          <p className="dash-hero-line">{heroLine}</p>
          <div className="dash-hero-actions">
            <button className="btn btn-primary" onClick={() => navigate("/performance", { state: { focusForm: true } })}>
              <PlusCircle size={16} /> Log a result
            </button>
            <button className="btn btn-ghost-light" onClick={() => navigate("/quizzes", { state: { focusForm: true } })}>
              <Sparkles size={16} /> Generate a quiz
            </button>
          </div>
        </div>
        <div
          className="dash-hero-streak"
          onClick={() => navigate("/streak")}
          onKeyDown={handleKeyActivation(() => navigate("/streak"))}
          role="button"
          tabIndex={0}
          aria-label={`Current streak ${currentStreak} days. Open streak page`}
        >
          <div className="dash-flame"><Flame size={22} /></div>
          <div className="dash-streak-num">
            {streakLoading ? "–" : currentStreak}
            <span>day streak</span>
          </div>
          <div className="cadence-bars dash-cadence" aria-hidden="true">
            {bars.map((b) => (
              <div key={b.date} className={`bar ${b.count ? "on" : ""}`} style={{ height: `${b.height}%` }} title={`${b.date}: ${b.count}`} />
            ))}
          </div>
          <small>Best: {longestStreak} days</small>
        </div>
      </section>

      {/* ---------- KPI tiles ---------- */}
      <section className="stat-grid" aria-label="Key numbers">
        <StatTile
          icon={Target}
          label="Average score"
          value={overallAvg !== null ? overallAvg.toFixed(1) : "—"}
          unit={overallAvg !== null ? "%" : undefined}
          delta={momentum}
          deltaLabel="pts"
          spark={percents.slice(-10)}
          hint={overallAvg !== null ? gradeFor(overallAvg).label : "No results yet"}
          loading={dataLoading}
          accent="indigo"
          onClick={() => navigate("/performance")}
        />
        <StatTile
          icon={ClipboardList}
          label="Results logged"
          value={records.length}
          hint={`${monthCount} this month`}
          loading={dataLoading}
          accent="teal"
          onClick={() => navigate("/performance")}
        />
        <StatTile
          icon={BookOpenCheck}
          label="Quiz average"
          value={quizAvg !== null ? quizAvg.toFixed(1) : "—"}
          unit={quizAvg !== null ? "%" : undefined}
          hint={`${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`}
          loading={dataLoading}
          accent="violet"
          onClick={() => navigate("/quizzes")}
        />
        <StatTile
          icon={Flame}
          label="Current streak"
          value={currentStreak}
          unit={currentStreak === 1 ? " day" : " days"}
          hint={`Longest ${longestStreak}`}
          loading={streakLoading}
          accent="amber"
          onClick={() => navigate("/streak")}
        />
      </section>

      {/* ---------- Trend + outlook ---------- */}
      <section className="dash-grid-main">
        <div className="card chart-card">
          <div className="card-head">
            <div>
              <h3>Score trend</h3>
              <p className="card-sub">Your last {trendData.length || ""} results as a percentage{overallAvg !== null ? ` · dashed line is your ${overallAvg.toFixed(1)}% average` : ""}</p>
            </div>
            {percents.length >= 2 && (
              <span className={`trend-chip ${slope > 0.3 ? "up" : slope < -0.3 ? "down" : "flat"}`}>
                {slope > 0.3 ? "Improving" : slope < -0.3 ? "Slipping" : "Steady"}
              </span>
            )}
          </div>
          {dataLoading ? (
            <SkeletonChart height={250} />
          ) : trendData.length === 0 ? (
            <EmptyState icon={LineChartIcon} message="Your trend line appears after your first logged result." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trendData} margin={{ top: 10, right: 12, left: -2, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.series[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={chart.series[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} unit="%" width={52} />
                {overallAvg !== null && (
                  <ReferenceLine y={overallAvg} stroke={chart.axis} strokeDasharray="4 4" />
                )}
                <Tooltip
                  cursor={{ stroke: chart.axis, strokeWidth: 1 }}
                  content={<ChartTooltip titleKey="label" valueSuffix="%" footer={(row) => String(row.date ?? "")} />}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  name="Score"
                  stroke={chart.series[0]}
                  strokeWidth={2}
                  fill="url(#dashTrendFill)"
                  dot={{ r: 3.5, fill: chart.series[0], stroke: chart.surface, strokeWidth: 2 }}
                  activeDot={{ r: 6, stroke: chart.surface, strokeWidth: 2 }}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <section className="card risk-outlook-card outlook-card" aria-labelledby="risk-outlook-title">
          <div className="risk-outlook-heading">
            <div>
              <p className="greeting-eyebrow">Risk analysis</p>
              <h2 id="risk-outlook-title">Academic Outlook</h2>
            </div>
            {!riskLoading && !riskError && risk && (
              <span className={`risk-level-badge risk-level-${risk.level}`}>
                <RiskIcon size={13} />
                {risk.level === "insufficient_data" ? "Not enough data" : risk.level}
              </span>
            )}
          </div>

          {riskLoading ? (
            <div className="outlook-skeleton"><SkeletonBlock height={120} width={120} radius={999} /><SkeletonBlock height={12} width="70%" /></div>
          ) : riskError ? (
            <div className="risk-outlook-message" role="alert">
              <p>{riskError}</p>
              <button className="secondary-btn btn btn-outline" onClick={() => void loadRisk()}><RefreshCw size={14} /> Try again</button>
            </div>
          ) : risk?.level === "insufficient_data" ? (
            <div className="outlook-empty">
              <ShieldQuestion size={34} />
              <p className="risk-outlook-message">{RISK_COPY.insufficient_data.blurb}</p>
              <button className="btn btn-outline" onClick={() => navigate("/performance", { state: { focusForm: true } })}>
                <PlusCircle size={14} /> Add a result
              </button>
            </div>
          ) : risk ? (
            <>
              <div className="outlook-body">
                <ProgressRing value={risk.score ?? 0} color={riskColor} size={124} stroke={11} label={`Risk score ${risk.score} out of 100`}>
                  <strong className="ring-value">{risk.score}</strong>
                  <span className="ring-caption">/ 100 risk</span>
                </ProgressRing>
                <div>
                  <p className="outlook-blurb">{riskCopy.blurb}</p>
                  {risk.reasons?.[0] && <p className="outlook-top-reason">“{risk.reasons[0]}”</p>}
                </div>
              </div>
              <p className="risk-outlook-score sr-only"><strong>{risk.score}</strong><span> / 100 risk score</span></p>
              <button
                type="button"
                className="outlook-toggle"
                aria-expanded={showRiskDetail}
                onClick={() => setShowRiskDetail((v) => !v)}
              >
                {showRiskDetail ? "Hide" : "Show"} reasons & next steps
                <ChevronDown size={15} className={showRiskDetail ? "flipped" : ""} />
              </button>
              {showRiskDetail && (
                <div className="risk-outlook-columns outlook-detail">
                  <div><h3>What we noticed</h3><ul>{risk.reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
                  <div><h3>Suggested next steps</h3><ul>{risk.suggestions?.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div>
                </div>
              )}
            </>
          ) : (
            <p className="risk-outlook-message">Risk analysis is not available yet.</p>
          )}
        </section>
      </section>

      {/* ---------- Subjects + activity ---------- */}
      <section className="dash-grid-split">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Subject strengths</h3>
              <p className="card-sub">Average score per subject</p>
            </div>
            <button className="link-btn" onClick={() => navigate("/performance")}>Details <ArrowRight size={14} /></button>
          </div>
          {dataLoading ? (
            <SkeletonRows rows={4} />
          ) : subjects.length === 0 ? (
            <EmptyState icon={Trophy} message="Subject insights appear once you've logged a few results." />
          ) : (
            <ul className="subject-bars">
              {subjects.map((s) => {
                const grade = gradeFor(s.average);
                return (
                  <li key={s.subject} title={`${s.subject}: ${s.average}% average over ${s.count} results (best ${s.best}%)`}>
                    <div className="subject-bar-label">
                      <span>{s.subject}</span>
                      <span className="mono">{s.average.toFixed(1)}% <em className={`grade-pill tone-${grade.tone}`}>{grade.letter}</em></span>
                    </div>
                    <div className="subject-bar-track">
                      <div className="subject-bar-fill" style={{ width: `${Math.max(3, s.average)}%` }} />
                    </div>
                    <small>{s.count} result{s.count === 1 ? "" : "s"} · best {s.best}%</small>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Recent activity</h3>
              <p className="card-sub">Latest results and quiz attempts</p>
            </div>
          </div>
          {dataLoading ? (
            <SkeletonRows rows={5} />
          ) : activity.length === 0 ? (
            <EmptyState icon={ClipboardList} message="Nothing here yet — your latest results will show up here." />
          ) : (
            <ul className="activity-list">
              {activity.map((item) => {
                const grade = item.pct !== null ? gradeFor(item.pct) : null;
                return (
                  <li key={item.id} className={`activity-item kind-${item.kind}`}>
                    <span className="activity-icon">
                      {item.kind === "result" ? <ClipboardList size={15} /> : <BookOpenCheck size={15} />}
                    </span>
                    <div className="activity-copy">
                      <strong>{item.title}</strong>
                      <span>{item.meta} · {formatShortDate(item.when)}</span>
                    </div>
                    {item.pct !== null && grade ? (
                      <span className={`score-pill tone-${grade.tone}`}>{Math.round(item.pct)}%</span>
                    ) : (
                      <span className="score-pill tone-pending">Pending</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- Module shortcuts ---------- */}
      <h2 className="section-title">Jump back in</h2>
      <div className="card-grid module-grid">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.path}
              className={`card module-card accent-${m.accent}`}
              onClick={() => navigate(m.path)}
              onKeyDown={handleKeyActivation(() => navigate(m.path))}
              role="button"
              tabIndex={0}
            >
              <div className="module-icon"><Icon size={19} /></div>
              <h3>{m.title}</h3>
              <p>{m.text}</p>
              <span className="module-go">Open <ArrowRight size={14} /></span>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
