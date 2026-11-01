import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";

interface Subject {
  subject_id: number;
  subject_name: string;
  subject_code: string;
}

interface PerformanceRecord {
  record_id: number;
  subject_id: number;
  subject_name: string;
  assessment_name: string;
  score: number;
  max_score: number;
  assessment_date: string;
  source?: "manual" | "quiz";
}

export default function Performance() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recordFilter, setRecordFilter] = useState<"all" | "tests" | "quizzes">("all");

  // Form state
  const [subjectId, setSubjectId] = useState("");
  const [assessmentName, setAssessmentName] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [subjectsRes, recordsRes] = await Promise.all([
        api.get("/subjects"),
        api.get("/performance"),
      ]);
      setSubjects(subjectsRes.data.subjects);
      setRecords(recordsRes.data.records);
    } catch (err) {
      console.error(err);
      setError("Could not load your performance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddRecord(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/performance", {
        subjectId: Number(subjectId),
        assessmentName,
        score: Number(score),
        maxScore: Number(maxScore),
        assessmentDate,
      });
      setAssessmentName("");
      setScore("");
      setMaxScore("100");
      setAssessmentDate("");
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not add record.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(recordId: number) {
    try {
      await api.delete(`/performance/${recordId}`);
      setRecords((prev) => prev.filter((r) => r.record_id !== recordId));
    } catch (err) {
      console.error(err);
      setError("Could not delete that record.");
    }
  }

  // Chart data: sorted chronologically, percentage-based so subjects with
  // different max scores are comparable on one axis.
  const filteredRecords = records.filter((record) =>
    recordFilter === "all" ||
    (recordFilter === "quizzes" ? record.source === "quiz" : record.source !== "quiz")
  );
  const chartData = [...filteredRecords]
    .sort((a, b) => a.assessment_date.localeCompare(b.assessment_date))
    .map((r) => {
      const isQuiz = r.source === "quiz";
      const percentage = Math.round((r.score / r.max_score) * 100);
      return ({
      date: r.assessment_date,
      testPercentage: isQuiz ? null : percentage,
      quizPercentage: isQuiz ? percentage : null,
      label: `${r.subject_name} — ${r.assessment_name}`,
      });
    });

  return (
    <AppLayout>
      <header className="topbar">
        <div>
          <p className="greeting-eyebrow">Academic Tracking</p>
          <h1>Performance</h1>
        </div>
      </header>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Add a result</h3>
          <form onSubmit={handleAddRecord} className="performance-form">
            <div className="form-row">
              <div>
                <label htmlFor="perf-subject">Subject</label>
                <select
                  id="perf-subject"
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
                <label htmlFor="perf-assessment">Assessment</label>
                <input
                  id="perf-assessment"
                  type="text"
                  value={assessmentName}
                  onChange={(e) => setAssessmentName(e.target.value)}
                  placeholder="e.g. Test 1"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div>
                <label htmlFor="perf-score">Score</label>
                <input
                  id="perf-score"
                  type="number"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  min={0}
                  required
                />
              </div>
              <div>
                <label htmlFor="perf-max-score">Out of</label>
                <input
                  id="perf-max-score"
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  min={1}
                  required
                />
              </div>
              <div>
                <label htmlFor="perf-date">Date</label>
                <input
                  id="perf-date"
                  type="date"
                  value={assessmentDate}
                  onChange={(e) => setAssessmentDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={submitting}>
              {submitting ? <Spinner label="Adding..." /> : <><Plus size={15} /> Add result</>}
            </button>
          </form>
        </div>

        <div className="performance-filter" role="group" aria-label="Filter performance records">
          {(["all", "tests", "quizzes"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              className={recordFilter === filter ? "active" : ""}
              aria-pressed={recordFilter === filter}
              onClick={() => setRecordFilter(filter)}
            >
              {filter === "all" ? "All" : filter === "tests" ? "Tests" : "Quizzes"}
            </button>
          ))}
        </div>

        {!loading && chartData.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3>Trend over time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--ink-soft)" }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: "var(--ink-soft)" }}
                  label={{ value: "%", position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value, name) => [`${value}%`, name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ""}
                />
                <Legend />
                <Line
                  type="monotone"
                  name="Test"
                  dataKey="testPercentage"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#4f46e5" }}
                />
                <Line
                  type="monotone"
                  name="Quiz"
                  dataKey="quizPercentage"
                  stroke="#0d9488"
                  strokeWidth={0}
                  dot={{ r: 5, fill: "#0d9488", stroke: "#0d9488" }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="card">
          <h3>All results</h3>
          {loading ? (
            <Spinner label="Loading your results..." />
          ) : filteredRecords.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              message={records.length === 0
                ? "No results yet — add your first one above."
                : `No ${recordFilter === "tests" ? "test" : "quiz"} results yet.`}
            />
          ) : (
            <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Assessment</th>
                  <th>Score</th>
                  <th>%</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.record_id}>
                    <td>{r.subject_name}</td>
                    <td>{r.assessment_name}{r.source === "quiz" && <small className="performance-source-badge">Quiz</small>}</td>
                    <td className="mono">
                      {r.score}/{r.max_score}
                    </td>
                    <td className="mono">{Math.round((r.score / r.max_score) * 100)}%</td>
                    <td className="mono">{r.assessment_date}</td>
                    <td>
                      {r.source === "quiz" ? <span className="performance-readonly">From quiz attempt</span> : <button
                        className="delete-btn"
                        onClick={() => handleDelete(r.record_id)}
                        aria-label={`Delete ${r.assessment_name}`}
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
    </AppLayout>
  );
}
