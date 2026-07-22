import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";

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

export default function Quizzes() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [studyText, setStudyText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [numQuestions, setNumQuestions] = useState("5");
  const [generating, setGenerating] = useState(false);

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
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setGenerating(true);
    try {
      const res = await api.post("/quizzes/generate", {
        subjectId: Number(subjectId),
        title,
        studyText,
        difficulty,
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

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-content">
        <header className="topbar">
          <div>
            <p className="greeting-eyebrow">AI-Generated</p>
            <h1>Quizzes</h1>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </header>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Generate a new quiz</h3>
          <p style={{ marginTop: -4, marginBottom: 16, fontSize: 13, color: "var(--ink-soft)" }}>
            Paste in your study notes or a section of your textbook — the AI will pull out the
            key concepts and build questions from them.
          </p>
          <form onSubmit={handleGenerate} className="performance-form">
            <div className="form-row">
              <div>
                <label>Subject</label>
                <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
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
                <label>Quiz title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Normalization basics"
                  required
                />
              </div>
            </div>

            <label>Study material</label>
            <textarea
              value={studyText}
              onChange={(e) => setStudyText(e.target.value)}
              placeholder="Paste your notes or textbook section here (at least a few sentences)..."
              rows={6}
              required
            />

            <div className="form-row">
              <div>
                <label>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label>Number of questions</label>
                <input
                  type="number"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(e.target.value)}
                  min={1}
                  max={15}
                />
              </div>
            </div>

            <button type="submit" disabled={generating}>
              {generating ? "Generating with AI..." : "Generate quiz"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Available quizzes</h3>
          {loading ? (
            <p>Loading...</p>
          ) : quizzes.length === 0 ? (
            <p>No quizzes yet — generate your first one above.</p>
          ) : (
            <div className="session-list">
              {quizzes.map((q) => (
                <div key={q.quiz_id} className="session-row">
                  <div>
                    <p className="session-title">{q.title}</p>
                    <p className="session-meta">
                      {q.subject_name} · {q.question_count} questions · {q.difficulty}
                    </p>
                  </div>
                  <button className="join-btn" onClick={() => navigate(`/quizzes/${q.quiz_id}`)}>
                    Take quiz
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
