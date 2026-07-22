import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";

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
  isCorrect: boolean;
  feedback?: string;
  correctAnswer: string | null;
}

export default function TakeQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [quizTitle, setQuizTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ score: number; maxScore: number; results: ResultItem[] } | null>(
    null
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/quizzes/${id}`);
        setQuizTitle(res.data.quiz.title);
        setQuestions(res.data.questions);
      } catch (err) {
        console.error(err);
        setError("Could not load this quiz.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function handleAnswerChange(questionId: number, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not submit your answers.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const resultByQuestionId = new Map(result?.results.map((r) => [r.questionId, r]) || []);

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-content">
        <header className="topbar">
          <div>
            <p className="greeting-eyebrow">Quiz</p>
            <h1>{quizTitle || "Loading..."}</h1>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </header>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

        {loading ? (
          <p>Loading...</p>
        ) : result ? (
          <div className="card">
            <h3>
              Score: {result.score}/{result.maxScore}
            </h3>
            <div className="quiz-results">
              {questions.map((q) => {
                const r = resultByQuestionId.get(q.question_id);
                return (
                  <div
                    key={q.question_id}
                    className={`result-item ${r?.isCorrect ? "correct" : "incorrect"}`}
                  >
                    <p className="result-question">{q.question_text}</p>
                    <p className="result-your-answer mono">
                      Your answer: {answers[q.question_id] || "(blank)"}
                    </p>
                    {!r?.isCorrect && r?.correctAnswer && (
                      <p className="result-correct-answer mono">
                        Correct answer: {r.correctAnswer}
                      </p>
                    )}
                    {r?.feedback && <p className="result-feedback">{r.feedback}</p>}
                  </div>
                );
              })}
            </div>
            <button className="join-btn" style={{ marginTop: 16 }} onClick={() => navigate("/quizzes")}>
              Back to quizzes
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card">
            {questions.map((q, i) => (
              <div key={q.question_id} className="quiz-question-block">
                <p className="quiz-question-number">Question {i + 1}</p>
                <p className="quiz-question-text">{q.question_text}</p>

                {q.question_type === "multiple_choice" ? (
                  <div className="quiz-options">
                    {(["A", "B", "C", "D"] as const).map((letter) => {
                      const optionText = q[`option_${letter.toLowerCase()}` as keyof Question];
                      if (!optionText) return null;
                      return (
                        <label key={letter} className="quiz-option">
                          <input
                            type="radio"
                            name={`q-${q.question_id}`}
                            value={letter}
                            checked={answers[q.question_id] === letter}
                            onChange={() => handleAnswerChange(q.question_id, letter)}
                          />
                          <span>
                            <strong>{letter}.</strong> {optionText as string}
                          </span>
                        </label>
                      );
                    })}
                  </div>
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
            <button type="submit" disabled={submitting}>
              {submitting ? "Grading with AI..." : "Submit answers"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
