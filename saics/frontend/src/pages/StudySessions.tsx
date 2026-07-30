import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, KeyRound, PlusCircle, LogIn, Users } from "lucide-react";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";

interface Subject {
  subject_id: number;
  subject_name: string;
}

interface SessionSummary {
  session_id: number;
  title: string;
  join_code: string;
  subject_name: string | null;
  host_name: string;
  participant_count: number;
  started_at: string;
}

export default function StudySessions() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);

  // Shown briefly right after creating a session, so the host can copy
  // the code before it scrolls away into the session list below.
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [sessionsRes, subjectsRes] = await Promise.all([
        api.get("/study-sessions"),
        api.get("/subjects"),
      ]);
      setSessions(sessionsRes.data.sessions);
      setSubjects(subjectsRes.data.subjects);
    } catch (err) {
      console.error(err);
      setError("Could not load study sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await api.post("/study-sessions", {
        title,
        subjectId: subjectId || null,
      });
      setJustCreatedCode(res.data.joinCode);
      setTimeout(() => navigate(`/study-sessions/${res.data.sessionId}`), 1800);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not create session.");
      setCreating(false);
    }
  }

  async function handleJoin(sessionId: number) {
    try {
      await api.post(`/study-sessions/${sessionId}/join`);
      navigate(`/study-sessions/${sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not join session.");
    }
  }

  async function handleJoinByCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setJoiningByCode(true);
    try {
      const res = await api.post("/study-sessions/join-by-code", {
        code: joinCodeInput.trim(),
      });
      navigate(`/study-sessions/${res.data.sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "No active session found with that code.");
      setJoiningByCode(false);
    }
  }

  return (
    <AppLayout>
      <header className="topbar">
        <div>
          <p className="greeting-eyebrow">Collaboration</p>
          <h1>Study Sessions</h1>
        </div>
      </header>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

      {justCreatedCode && (
        <div className="join-code-banner">
          Session created — share this code: <span className="mono">{justCreatedCode}</span>
        </div>
      )}

      <div className="two-col-row">
        <div className="card">
          <div className="card-icon-badge"><Mic size={18} /></div>
          <h3>Start a new session</h3>
          <form onSubmit={handleCreate} className="performance-form">
            <label htmlFor="session-title">Session title</label>
            <input
              id="session-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Databases revision"
              required
            />

            <label htmlFor="session-subject">Subject (optional)</label>
            <select
              id="session-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">No specific subject</option>
              {subjects.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name}
                </option>
              ))}
            </select>

            <button type="submit" disabled={creating}>
              {creating ? <Spinner label="Starting..." /> : <><PlusCircle size={15} /> Start session</>}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Join with a code</h3>
          <p style={{ marginTop: -4, marginBottom: 16, fontSize: 13, color: "var(--ink-soft)" }}>
            Got a code from a classmate? Enter it here to jump straight into their session.
          </p>
          <form onSubmit={handleJoinByCode} className="performance-form">
            <label htmlFor="join-code">Session code</label>
            <input
              id="join-code"
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. 7X2K9Q"
              maxLength={10}
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              required
            />
            <button type="submit" disabled={joiningByCode}>
              {joiningByCode ? <Spinner label="Joining..." /> : <><KeyRound size={15} /> Join session</>}
            </button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Active sessions</h3>
        {loading ? (
          <Spinner label="Loading sessions..." />
        ) : sessions.length === 0 ? (
          <EmptyState icon={Users} message="No active sessions right now — start one above." />
        ) : (
          <div className="session-list">
            {sessions.map((s) => (
              <div key={s.session_id} className="session-row">
                <div>
                  <p className="session-title">
                    {s.title} <span className="session-code mono">{s.join_code}</span>
                  </p>
                  <p className="session-meta">
                    {s.subject_name ? `${s.subject_name} · ` : ""}
                    Hosted by {s.host_name} · {s.participant_count} in the room
                  </p>
                </div>
                <button className="join-btn" onClick={() => handleJoin(s.session_id)}>
                  <LogIn size={14} />
                  Join
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
