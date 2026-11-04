import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Send,
  ArrowLeft,
  Trophy,
  RotateCcw,
  Flag,
  Clock3,
  HelpCircle,
  Hourglass,
  Cpu,
} from "lucide-react";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import ProgressRing from "../components/ui/ProgressRing";
import { useChartTheme } from "../hooks/useChartTheme";
import { useToast } from "../context/ToastContext";
import { gradeFor } from "../utils/academics";

interface Question {
  question_id: number;
  question_text: string;
  question_type: "multiple_choice" | "short_answer" | "long_answer";
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
}

interface ResultItem {
  questionId: number;
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number;
  feedback: string | null;
  criterionComments: {
    criterion: string;
    points: number;
    maxPoints: number;
    comment: string;
  }[] | null;
  gradingStatus: "pending" | "completed";
  gradingSource: "ai-provider" | "local-engine" | null;
  correctAnswer: string | null;
}

interface QuizResult {
  score: number | null;
  maxScore: number;
  gradingStatus: "pending" | "completed";
  message?: string;
  results: ResultItem[];
}

const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function TakeQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const chart = useChartTheme();
  const toast = useToast();

  const [quizTitle, setQuizTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState<number | null>(null);
  const [flagging, setFlagging] = useState<number | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/quizzes/${id}`);
        setQuizTitle(res.data.quiz.title);
        setQuestions(res.data.questions);
        setStartedAt(Date.now());
      } catch (err) {
        console.error(err);
        setError("Could not load this quiz.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    if (result || loading) return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [result, loading, startedAt]);

  function handleAnswerChange(questionId: number, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setConfirmUnanswered(false);
  }

  const answeredCount = questions.filter((q) => (answers[q.question_id] ?? "").trim() !== "").length;
  const unanswered = questions.length - answeredCount;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (unanswered > 0 && !confirmUnanswered) {
      setConfirmUnanswered(true);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.question_id,
          studentAnswer: answers[q.question_id] || "",
        })),
      };
      const res = await api.post(`/quizzes/${id}/submit`, payload);
      setResult(res.data as QuizResult);
      setFinalElapsed(Math.floor((Date.now() - startedAt) / 1000));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not submit your answers.");
    } finally {
      setSubmitting(false);
      setConfirmUnanswered(false);
    }
  }

  function retake() {
    setResult(null);
    setAnswers({});
    setStartedAt(Date.now());
    setElapsed(0);
    setFinalElapsed(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpTo(questionId: number) {
    const el = blockRefs.current.get(questionId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }

  async function submitFlag(questionId: number) {
    if (!flagReason.trim()) return;
    try {
      await api.post(`/quizzes/${id}/flag`, { questionId, reason: flagReason.trim() });
      setFlagged((prev) => new Set(prev).add(questionId));
      setFlagging(null);
      setFlagReason("");
      toast.success("Thanks — the question was reported for review.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Could not report this question.");
    }
  }

  const resultByQuestionId = new Map(result?.results.map((r) => [r.questionId, r]) || []);
  const pct = result && result.score !== null && result.maxScore > 0 ? (result.score / result.maxScore) * 100 : null;
  const grade = pct !== null ? gradeFor(pct) : null;
  const correctCount = result?.results.filter((r) => r.gradingStatus === "completed" && r.isCorrect).length ?? 0;
  const pendingCount = result?.results.filter((r) => r.gradingStatus === "pending").length ?? 0;
  const incorrectCount = (result?.results.length ?? 0) - correctCount - pendingCount;
  const ringColor = pct === null ? chart.axis : pct >= 70 ? chart.status.good : pct >= 50 ? chart.status.warning : chart.status.critical;

  return (
    <AppLayout>
      <header className="topbar page-header">
        <div>
          <button className="back-link" onClick={() => navigate("/quizzes")}><ArrowLeft size={14} /> All quizzes</button>
          <p className="greeting-eyebrow">Quiz</p>
          <h1>{quizTitle || "Loading..."}</h1>
        </div>
        {!loading && !result && questions.length > 0 && (
          <div className="quiz-meta-chips">
            <span className="meta-chip"><HelpCircle size={14} /> {questions.length} questions</span>
            <span className="meta-chip mono"><Clock3 size={14} /> {fmtElapsed(elapsed)}</span>
          </div>
        )}
      </header>

      {error && <div className="error-banner" style={{ marginBottom: 20 }} role="alert">{error}</div>}

        {loading ? (
          <Spinner label="Loading quiz..." />
        ) : result ? (
          <div className="card quiz-result-card">
            {result.message && (
              <div className="error-banner" style={{ marginBottom: 16 }}>
                {result.message}
              </div>
            )}
            <div className="result-hero">
              <ProgressRing value={pct ?? 0} color={ringColor} size={140} stroke={12} label={pct !== null ? `Score ${Math.round(pct)} percent` : "Pending grading"}>
                {pct !== null ? (
                  <>
                    <strong className="ring-value">{Math.round(pct)}%</strong>
                    <span className="ring-caption">{grade?.letter} · {grade?.label}</span>
                  </>
                ) : (
                  <>
                    <Hourglass size={22} />
                    <span className="ring-caption">Pending</span>
                  </>
                )}
              </ProgressRing>
              <div className="result-hero-copy">
                <h3 className="quiz-score-heading">
                  <Trophy size={20} />
                  {result.gradingStatus === "pending"
                    ? "Pending grading"
                    : `Score: ${result.score}/${result.maxScore}`}
                </h3>
                <p className="card-sub">
                  {pct === null
                    ? "Some answers are still being graded. Check back on your attempts list shortly."
                    : pct >= 80
                      ? "Outstanding work — you clearly know this material."
                      : pct >= 50
                        ? "Solid effort. Review the feedback below to close the gaps."
                        : "Tough one. Read through the feedback, then try again — repetition builds mastery."}
                </p>
                <div className="result-tally">
                  <span className="tally good"><CheckCircle2 size={14} /> {correctCount} correct</span>
                  <span className="tally bad"><XCircle size={14} /> {incorrectCount} to review</span>
                  {pendingCount > 0 && <span className="tally pending"><Hourglass size={14} /> {pendingCount} pending</span>}
                  {finalElapsed !== null && <span className="tally"><Clock3 size={14} /> {fmtElapsed(finalElapsed)}</span>}
                </div>
                <div className="result-actions">
                  <button className="btn btn-primary" onClick={retake}><RotateCcw size={15} /> Retake quiz</button>
                  <button className="join-btn" onClick={() => navigate("/quizzes")}>
                    <ArrowLeft size={14} />
                    Back to quizzes
                  </button>
                </div>
              </div>
            </div>

            <div className="quiz-results">
              {questions.map((q, i) => {
                const r = resultByQuestionId.get(q.question_id);
                return (
                  <div
                    key={q.question_id}
                    className={`result-item ${
                      r?.gradingStatus === "pending"
                        ? "pending"
                        : r?.isCorrect
                          ? "correct"
                          : "incorrect"
                    }`}
                  >
                    <p className="result-number">Question {i + 1}</p>
                    <p className="result-question">
                      {r?.gradingStatus === "pending" ? null : r?.isCorrect ? (
                        <CheckCircle2 size={16} className="result-icon correct-icon" />
                      ) : (
                        <XCircle size={16} className="result-icon incorrect-icon" />
                      )}
                      {q.question_text}
                    </p>
                    <p className="result-your-answer mono">
                      Your answer: {answers[q.question_id] || "(blank)"}
                    </p>
                    {r && (
                      <p className="result-your-answer">
                        Points: {r.score === null ? "Pending" : r.score}/{r.maxScore}
                      </p>
                    )}
                    {r?.gradingStatus === "completed" && !r.isCorrect && r.correctAnswer && (
                      <p className="result-correct-answer mono">
                        Correct answer: {r.correctAnswer}
                      </p>
                    )}
                    {r?.feedback && <p className="result-feedback">{r.feedback}</p>}
                    {r?.gradingSource === "local-engine" && (
                      <p className="result-feedback engine-note"><Cpu size={12} /> Auto-graded (offline engine)</p>
                    )}
                    {r?.criterionComments && (
                      <ul className="criterion-comments">
                        {r.criterionComments.map((item) => (
                          <li key={item.criterion}>
                            <strong>{item.criterion}: {item.points}/{item.maxPoints} pts</strong>
                            <span className="criterion-meter" aria-hidden="true"><i style={{ width: `${item.maxPoints ? (item.points / item.maxPoints) * 100 : 0}%` }} /></span>
                            <span>{item.comment}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flag-row">
                      {flagged.has(q.question_id) ? (
                        <span className="flag-done"><Flag size={12} /> Reported</span>
                      ) : flagging === q.question_id ? (
                        <div className="flag-form">
                          <input
                            autoFocus
                            value={flagReason}
                            maxLength={1000}
                            onChange={(e) => setFlagReason(e.target.value)}
                            placeholder="What's wrong with this question?"
                            aria-label="Reason for reporting this question"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitFlag(q.question_id); } }}
                          />
                          <button type="button" className="ghost-btn" onClick={() => void submitFlag(q.question_id)} disabled={!flagReason.trim()}>Send</button>
                          <button type="button" className="ghost-btn" onClick={() => { setFlagging(null); setFlagReason(""); }}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" className="flag-btn" onClick={() => { setFlagging(q.question_id); setFlagReason(""); }}>
                          <Flag size={12} /> Report an issue
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : questions.length === 0 ? (
          <div className="card"><p className="card-sub">This quiz has no questions.</p></div>
        ) : (
          <>
            <div className="quiz-progress-sticky">
              <div className="quiz-progress-info">
                <span><strong>{answeredCount}</strong> of {questions.length} answered</span>
                <span className="mono">{Math.round((answeredCount / questions.length) * 100)}%</span>
              </div>
              <div className="quiz-progress-track"><span style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div>
              <div className="quiz-dots" role="navigation" aria-label="Jump to question">
                {questions.map((q, i) => (
                  <button
                    key={q.question_id}
                    type="button"
                    className={(answers[q.question_id] ?? "").trim() ? "answered" : ""}
                    onClick={() => jumpTo(q.question_id)}
                    aria-label={`Question ${i + 1}${(answers[q.question_id] ?? "").trim() ? " (answered)" : ""}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="card performance-form quiz-form">
              {questions.map((q, i) => (
                <div
                  key={q.question_id}
                  className={`quiz-question-block ${(answers[q.question_id] ?? "").trim() ? "is-answered" : ""}`}
                  ref={(el) => { if (el) blockRefs.current.set(q.question_id, el); else blockRefs.current.delete(q.question_id); }}
                >
                  <p className="quiz-question-number">Question {i + 1} <span>of {questions.length}</span></p>
                  <p className="quiz-question-text">{q.question_text}</p>

                  {q.question_type === "multiple_choice" ? (
                    <div className="quiz-options">
                      {(["A", "B", "C", "D"] as const).map((letter) => {
                        const optionText = q[`option_${letter.toLowerCase()}` as keyof Question];
                        if (!optionText) return null;
                        const checked = answers[q.question_id] === letter;
                        return (
                          <label key={letter} className={`quiz-option ${checked ? "selected" : ""}`}>
                            <input
                              type="radio"
                              name={`q-${q.question_id}`}
                              value={letter}
                              checked={checked}
                              onChange={() => handleAnswerChange(q.question_id, letter)}
                            />
                            <span className="option-letter" aria-hidden="true">{letter}</span>
                            <span>
                              <strong className="sr-only">{letter}.</strong> {optionText as string}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : q.question_type === "long_answer" ? (
                    <>
                      <textarea
                        value={answers[q.question_id] || ""}
                        onChange={(e) => handleAnswerChange(q.question_id, e.target.value)}
                        placeholder="Write your answer"
                        rows={5}
                      />
                      <p className="word-count">
                        {(answers[q.question_id] || "").trim() ? (answers[q.question_id] || "").trim().split(/\s+/).length : 0} words
                      </p>
                    </>
                  ) : (
                    <input
                      type="text"
                      value={answers[q.question_id] || ""}
                      onChange={(e) => handleAnswerChange(q.question_id, e.target.value)}
                      placeholder="Your answer"
                    />
                  )}
                </div>
              ))}

              {confirmUnanswered && (
                <div className="confirm-banner" role="alert">
                  <HelpCircle size={16} />
                  <span>You have {unanswered} unanswered question{unanswered === 1 ? "" : "s"}. Submit anyway?</span>
                </div>
              )}
              <button type="submit" disabled={submitting}>
                {submitting ? (
                  <Spinner label="Grading with AI..." />
                ) : (
                  <>
                    <Send size={15} />
                    {confirmUnanswered ? "Yes, submit answers" : "Submit answers"}
                  </>
                )}
              </button>
            </form>
          </>
        )}
    </AppLayout>
  );
}
