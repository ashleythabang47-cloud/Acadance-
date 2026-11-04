import { useEffect, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, KeyRound, PlusCircle, LogIn, Users, Copy, Check, RefreshCw, Radio, Clock3 } from "lucide-react";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { SkeletonRows } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import { formatRelativeTime } from "../utils/formatRelativeTime";

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  async function copy(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Copied code ${code}`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy — select the code and copy it manually.");
    }
  }
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy join code ${code}`} title="Copy code">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

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

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
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
      <PageHeader
        eyebrow="Collaboration"
        title="Study Sessions"
        subtitle="Voice rooms for revising together — start one or hop into a classmate's."
        actions={
          <button className="btn btn-outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh
          </button>
        }
      />

      {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

      {justCreatedCode && (
        <div className="join-code-banner" role="status">
          <Radio size={16} />
          <span>Session created — share this code: <span className="mono">{justCreatedCode}</span></span>
          <CopyCodeButton code={justCreatedCode} />
          <small>Taking you to the room…</small>
        </div>
      )}

      <div className="two-col-row">
        <div className="card">
          <div className="card-icon-badge card-icon-blue"><Mic size={18} /></div>
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
          <div className="card-icon-badge card-icon-violet"><KeyRound size={18} /></div>
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
        <div className="card-head">
          <div>
            <h3><span className="live-dot" aria-hidden="true" /> Active sessions</h3>
            <p className="card-sub">{sessions.length} room{sessions.length === 1 ? "" : "s"} live right now</p>
          </div>
        </div>
        {loading ? (
          <SkeletonRows rows={3} />
        ) : sessions.length === 0 ? (
          <EmptyState icon={Users} message="No active sessions right now — start one above." />
        ) : (
          <div className="session-list">
            {sessions.map((s) => (
              <div key={s.session_id} className="session-row live-session">
                <div className="session-avatar" aria-hidden="true">{s.title.charAt(0).toUpperCase()}</div>
                <div className="session-info">
                  <p className="session-title">
                    {s.title} <span className="session-code mono">{s.join_code}</span>
                    <CopyCodeButton code={s.join_code} />
                  </p>
                  <p className="session-meta">
                    {s.subject_name ? `${s.subject_name} · ` : ""}
                    Hosted by {s.host_name} · {s.participant_count} in the room
                    {s.started_at && <span className="session-age"><Clock3 size={11} /> {formatRelativeTime(s.started_at)}</span>}
                  </p>
                </div>
                <span className="participant-pill" title={`${s.participant_count} participants`}>
                  <Users size={13} /> {s.participant_count}
                </span>
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
