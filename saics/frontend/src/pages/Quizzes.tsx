import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  Sparkles,
  BookOpenCheck,
  ArrowRight,
  Search,
  ListChecks,
  AlignLeft,
  History,
  Library,
  Wand2,
  X,
  Clock3,
} from "lucide-react";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import ChartTooltip from "../components/ui/ChartTooltip";
import { SkeletonRows } from "../components/ui/Skeleton";
import { useChartTheme } from "../hooks/useChartTheme";
import { percentOf, gradeFor, average, formatShortDate, toDateKey } from "../utils/academics";

interface Subject {
  subject_id: number;
  subject_name: string;
}

interface QuizSummary {
  quiz_id: number;
  title: string;
  subject_name: string;
  difficulty: string;
  question_count: number;
  created_at: string;
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

const GENERATION_STEPS = [
  "Reading your study material…",
  "Picking out the key concepts…",
  "Drafting questions…",
  "Checking answers and distractors…",
  "Almost there…",
];

const MAX_TOPIC = 8000;

export default function Quizzes() {
  const navigate = useNavigate();
  const location = useLocation();
  const chart = useChartTheme();
  const formRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"library" | "history">("library");
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");

  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [studyText, setStudyText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [questionType, setQuestionType] = useState<"multiple_choice" | "long_answer">(
    "multiple_choice"
  );
  const [numQuestions, setNumQuestions] = useState("5");
  const [generating, setGenerating] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  async function loadData() {
    setLoading(true);
    try {
      const [quizzesRes, subjectsRes] = await Promise.all([
        api.get("/quizzes"),
        api.get("/subjects"),
      ]);
      setQuizzes(quizzesRes.data.quizzes);
      setSubjects(subjectsRes.data.subjects);
    } catch (err) {
      console.error(err);
      setError("Could not load quizzes.");
    } finally {
      setLoading(false);
    }
    // History is a bonus view — never let it block the main page.
    api.get("/quizzes/history/me").then((res) => setAttempts(res.data.history ?? [])).catch(() => {});
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if ((location.state as { focusForm?: boolean } | null)?.focusForm) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => firstFieldRef.current?.focus(), 350);
    }
  }, [location.state]);

  useEffect(() => {
    if (!generating) return;
    setStepIndex(0);
    const id = window.setInterval(() => setStepIndex((i) => Math.min(i + 1, GENERATION_STEPS.length - 1)), 2600);
    return () => window.clearInterval(id);
  }, [generating]);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setGenerating(true);
    try {
      const res = await api.post("/quizzes/generate", {
        subjectId: Number(subjectId),
        title,
        topic: studyText,
        difficulty,
        questionType,
        numQuestions: Number(numQuestions),
      });
      setTitle("");
      setStudyText("");
      navigate(`/quizzes/${res.data.quizId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not generate quiz. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const filteredQuizzes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quizzes.filter(
      (quiz) =>
        (difficultyFilter === "all" || quiz.difficulty === difficultyFilter) &&
        (!q || `${quiz.title} ${quiz.subject_name}`.toLowerCase().includes(q))
    );
  }, [quizzes, search, difficultyFilter]);

  const graded = attempts
    .filter((a) => a.grading_status === "completed" && percentOf(a) !== null)
    .map((a) => ({ ...a, pct: percentOf(a)!, key: toDateKey(a.completed_at) }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.attempt_id - b.attempt_id);
  const attemptChart = graded.slice(-16).map((a) => ({
    name: formatShortDate(a.key),
    pct: a.pct,
    label: `${a.title} · ${a.subject_name}`,
  }));
  const attemptAvg = average(graded.map((a) => a.pct));
  const passRate = graded.length ? Math.round((graded.filter((a) => a.pct >= 50).length / graded.length) * 100) : null;

  // Group quizzes by subject for the library header chips
  const subjectNameFor = subjects.find((s) => String(s.subject_id) === subjectId)?.subject_name;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="AI-Generated"
        title="Quizzes"
        subtitle="Turn any topic or set of notes into practice questions — graded instantly."
      />

      {error && <div className="error-banner" style={{ marginBottom: 20 }} role="alert">{error}</div>}

      <div className="card generator-card" ref={formRef} style={{ marginBottom: 24 }}>
        <div className="generator-glow" aria-hidden="true" />
        <div className="card-head">
          <div>
            <h3><Wand2 size={17} className="inline-icon" /> Generate a new quiz</h3>
            <p className="card-sub">Enter a topic or paste study notes. Choose multiple-choice or long-answer questions.</p>
          </div>
        </div>
        {generating ? (
          <div className="generating-state" role="status" aria-live="polite">
            <div className="generating-orb"><Sparkles size={26} /></div>
            <p className="generating-step">{GENERATION_STEPS[stepIndex]}</p>
            <div className="generating-progress"><span style={{ width: `${((stepIndex + 1) / GENERATION_STEPS.length) * 100}%` }} /></div>
            <small>Building {numQuestions} {questionType === "multiple_choice" ? "multiple-choice" : "long-answer"} question{numQuestions === "1" ? "" : "s"}{subjectNameFor ? ` for ${subjectNameFor}` : ""}. This usually takes a few seconds.</small>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="performance-form">
            <div className="form-row">
              <div>
                <label htmlFor="quiz-subject">Subject</label>
                <select
                  id="quiz-subject"
                  ref={firstFieldRef}
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a subject
                  </option>
                  {subjects.map((s) => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.subject_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quiz-title">Quiz title</label>
                <input
                  id="quiz-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Normalization basics"
                  required
                />
              </div>
            </div>

            <div className="label-row">
              <label htmlFor="quiz-study-text">Topic or study material</label>
              <span className={`char-count ${studyText.length > MAX_TOPIC ? "over" : ""}`}>{studyText.length.toLocaleString()} chars</span>
            </div>
            <textarea
              id="quiz-study-text"
              value={studyText}
              onChange={(e) => setStudyText(e.target.value)}
              placeholder="e.g. Photosynthesis, or paste your notes..."
              rows={6}
              required
            />

            <div className="form-row generator-options">
              <div>
                <span className="field-label" id="quiz-question-type-label">Question type</span>
                <div className="segmented choice" role="radiogroup" aria-labelledby="quiz-question-type-label">
                  <button type="button" role="radio" aria-checked={questionType === "multiple_choice"} className={questionType === "multiple_choice" ? "active" : ""} onClick={() => setQuestionType("multiple_choice")}>
                    <ListChecks size={15} /> Multiple choice
                  </button>
                  <button type="button" role="radio" aria-checked={questionType === "long_answer"} className={questionType === "long_answer" ? "active" : ""} onClick={() => setQuestionType("long_answer")}>
                    <AlignLeft size={15} /> Long answer
                  </button>
                </div>
              </div>
              <div>
                <span className="field-label" id="quiz-difficulty-label">Difficulty</span>
                <div className="segmented choice difficulty" role="radiogroup" aria-labelledby="quiz-difficulty-label">
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={difficulty === d} className={`${difficulty === d ? "active" : ""} diff-${d}`} onClick={() => setDifficulty(d)}>
                      <span className="diff-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= ["easy", "medium", "hard"].indexOf(d) ? "on" : ""} />)}</span>
                      {d[0].toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label-row">
                  <label htmlFor="quiz-num-questions">Number of questions</label>
                  <span className="range-value mono">{numQuestions}</span>
                </div>
                <input
                  id="quiz-num-questions"
                  className="range-input"
                  type="range"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(e.target.value)}
                  min={1}
                  max={15}
                  style={{ ["--fill" as string]: `${((Number(numQuestions) - 1) / 14) * 100}%` }}
                />
                <div className="range-scale" aria-hidden="true"><span>1</span><span>15</span></div>
              </div>
            </div>

            <button type="submit" className="generate-btn" disabled={generating || studyText.length > MAX_TOPIC}>
              <Sparkles size={15} />
              Generate quiz
            </button>
          </form>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Quiz views">
        <button role="tab" aria-selected={tab === "library"} className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          <Library size={15} /> Available quizzes <span className="tab-count">{quizzes.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          <History size={15} /> My attempts <span className="tab-count">{attempts.length}</span>
        </button>
      </div>

      {tab === "library" ? (
        <div className="card" role="tabpanel">
          <div className="card-head">
            <div>
              <h3>Available quizzes</h3>
              <p className="card-sub">{filteredQuizzes.length} quiz{filteredQuizzes.length === 1 ? "" : "zes"}</p>
            </div>
            <div className="card-head-tools">
              <select className="filter-select" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label="Filter by difficulty">
                <option value="all">Any difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <label className="search-input">
                <Search size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quizzes…" aria-label="Search quizzes" />
                {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={13} /></button>}
              </label>
            </div>
          </div>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : quizzes.length === 0 ? (
            <EmptyState
              icon={BookOpenCheck}
              message="No quizzes yet — generate your first one above."
            />
          ) : filteredQuizzes.length === 0 ? (
            <EmptyState icon={Search} message="No quizzes match your search." />
          ) : (
            <div className="quiz-grid">
              {filteredQuizzes.map((q) => (
                <article key={q.quiz_id} className="quiz-card">
                  <div className="quiz-card-top">
                    <span className={`diff-badge diff-${q.difficulty}`}>{q.difficulty}</span>
                    <span className="quiz-card-date"><Clock3 size={12} /> {formatShortDate(q.created_at)}</span>
                  </div>
                  <h4 className="session-title">{q.title}</h4>
                  <p className="session-meta">
                    {q.subject_name} · {q.question_count} questions · {q.difficulty}
                  </p>
                  <button className="join-btn" onClick={() => navigate(`/quizzes/${q.quiz_id}`)}>
                    Take quiz
                    <ArrowRight size={14} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card" role="tabpanel">
          <div className="card-head">
            <div>
              <h3>My attempts</h3>
              <p className="card-sub">
                {graded.length
                  ? `${graded.length} graded · average ${attemptAvg?.toFixed(1)}% · ${passRate}% passed`
                  : "Your graded quiz attempts will be charted here."}
              </p>
            </div>
          </div>
          {attemptChart.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={attemptChart} margin={{ top: 8, right: 8, left: -2, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} minTickGap={10} />
                <YAxis domain={[0, 100]} unit="%" width={52} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} />
                <ReferenceLine y={50} stroke={chart.axis} strokeDasharray="2 4" />
                <Tooltip cursor={{ fill: chart.grid }} content={<ChartTooltip titleKey="label" valueSuffix="%" footer={(row) => String(row.name ?? "")} />} />
                <Bar dataKey="pct" name="Score" radius={[4, 4, 0, 0]} maxBarSize={34}>
                  {attemptChart.map((a, i) => <Cell key={i} fill={chart.series[2]} fillOpacity={a.pct >= 50 ? 1 : 0.45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {attempts.length === 0 ? (
            <EmptyState icon={History} message="You haven't attempted any quizzes yet." />
          ) : (
            <ul className="activity-list attempt-list">
              {attempts.map((a) => {
                const p = percentOf(a);
                const pending = a.grading_status !== "completed" || p === null;
                return (
                  <li key={a.attempt_id} className="activity-item">
                    <span className="activity-icon"><BookOpenCheck size={15} /></span>
                    <div className="activity-copy">
                      <strong>{a.title}</strong>
                      <span>{a.subject_name} · {formatShortDate(a.completed_at)}</span>
                    </div>
                    {pending ? (
                      <span className="score-pill tone-pending">Pending</span>
                    ) : (
                      <span className={`score-pill tone-${gradeFor(p).tone}`}>
                        {Number(a.score)}/{Number(a.max_score)} · {Math.round(p)}%
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {loading && <Spinner label="Loading..." />}
        </div>
      )}
    </AppLayout>
  );
}
