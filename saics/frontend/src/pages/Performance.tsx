import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  ComposedChart,
  Line,
  Scatter,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Plus,
  Trash2,
  ClipboardList,
  Download,
  Search,
  Target,
  Trophy,
  Clock3,
  Hash,
  Pencil,
  X,
  Save,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from "lucide-react";
import { api } from "../api/client";
import AppLayout from "../components/AppLayout";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import StatTile from "../components/ui/StatTile";
import ChartTooltip from "../components/ui/ChartTooltip";
import { SkeletonChart } from "../components/ui/Skeleton";
import { useChartTheme } from "../hooks/useChartTheme";
import { useToast } from "../context/ToastContext";
import {
  percentOf,
  average,
  gradeFor,
  summariseBySubject,
  toDateKey,
  formatShortDate,
  formatLongDate,
  todayKey,
  downloadCsv,
} from "../utils/academics";

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

type SortKey = "date" | "subject" | "assessment" | "pct";

export default function Performance() {
  const chart = useChartTheme();
  const toast = useToast();
  const location = useLocation();
  const formRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recordFilter, setRecordFilter] = useState<"all" | "tests" | "quizzes">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [assessmentName, setAssessmentName] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [assessmentDate, setAssessmentDate] = useState(todayKey());
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

  // Arriving from "Log a result" shortcuts focuses the form.
  useEffect(() => {
    if ((location.state as { focusForm?: boolean } | null)?.focusForm) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => firstFieldRef.current?.focus(), 350);
    }
  }, [location.state]);

  function resetForm() {
    setEditingId(null);
    setAssessmentName("");
    setScore("");
    setMaxScore("100");
    setAssessmentDate(todayKey());
  }

  function startEdit(r: PerformanceRecord) {
    setEditingId(r.record_id);
    setSubjectId(String(r.subject_id));
    setAssessmentName(r.assessment_name);
    setScore(String(Number(r.score)));
    setMaxScore(String(Number(r.max_score)));
    setAssessmentDate(toDateKey(r.assessment_date));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleAddRecord(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (Number(score) > Number(maxScore)) {
      setError("Score can't be higher than the maximum mark.");
      return;
    }
    setSubmitting(true);
    const payload = {
      subjectId: Number(subjectId),
      assessmentName,
      score: Number(score),
      maxScore: Number(maxScore),
      assessmentDate,
    };
    try {
      if (editingId) {
        await api.put(`/performance/${editingId}`, payload);
        toast.success("Result updated.");
      } else {
        await api.post("/performance", payload);
        toast.success(`Added ${assessmentName} — ${livePct !== null ? `${Math.round(livePct)}%` : "saved"}.`);
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || (editingId ? "Could not update record." : "Could not add record."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(recordId: number) {
    try {
      await api.delete(`/performance/${recordId}`);
      setRecords((prev) => prev.filter((r) => r.record_id !== recordId));
      if (editingId === recordId) resetForm();
      toast.success("Result deleted.");
    } catch (err) {
      console.error(err);
      setError("Could not delete that record.");
    } finally {
      setPendingDelete(null);
    }
  }

  // ---------- Filtering ----------
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      const typeOk =
        recordFilter === "all" ||
        (recordFilter === "quizzes" ? record.source === "quiz" : record.source !== "quiz");
      const subjectOk = subjectFilter === "all" || String(record.subject_id) === subjectFilter;
      const searchOk = !q || `${record.assessment_name} ${record.subject_name}`.toLowerCase().includes(q);
      return typeOk && subjectOk && searchOk;
    });
  }, [records, recordFilter, subjectFilter, search]);

  const sortedRecords = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filteredRecords].sort((a, b) => {
      switch (sort.key) {
        case "subject": return a.subject_name.localeCompare(b.subject_name) * dir;
        case "assessment": return a.assessment_name.localeCompare(b.assessment_name) * dir;
        case "pct": return ((percentOf(a) ?? 0) - (percentOf(b) ?? 0)) * dir;
        default: return (toDateKey(a.assessment_date).localeCompare(toDateKey(b.assessment_date)) || a.record_id - b.record_id) * dir;
      }
    });
  }, [filteredRecords, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" || key === "pct" ? "desc" : "asc" }));
  }

  // ---------- Stats ----------
  const chrono = [...filteredRecords]
    .map((r) => ({ r, pct: percentOf(r), key: toDateKey(r.assessment_date) }))
    .filter((x): x is { r: PerformanceRecord; pct: number; key: string } => x.pct !== null)
    .sort((a, b) => a.key.localeCompare(b.key) || a.r.record_id - b.r.record_id);
  const pcts = chrono.map((x) => x.pct);
  const avg = average(pcts);
  const best = chrono.length ? chrono.reduce((m, x) => (x.pct > m.pct ? x : m), chrono[0]) : null;
  const latest = chrono[chrono.length - 1] ?? null;
  const prevAvg = average(pcts.slice(0, -1));
  const latestDelta = latest && prevAvg !== null ? latest.pct - prevAvg : null;

  // Chart data: chronological, percentage-based so different max scores compare.
  const chartData = chrono.map(({ r, pct, key }, i) => {
    const isQuiz = r.source === "quiz";
    const window = pcts.slice(Math.max(0, i - 2), i + 1);
    return {
      date: formatShortDate(key),
      testPercentage: isQuiz ? null : pct,
      quizPercentage: isQuiz ? pct : null,
      rolling: pcts.length >= 3 ? Math.round((average(window) ?? 0) * 10) / 10 : null,
      label: `${r.subject_name} — ${r.assessment_name}`,
    };
  });

  const subjectSummary = summariseBySubject(filteredRecords);
  const gradeBuckets = ["A", "B", "C", "D", "F"].map((letter) => ({
    letter,
    count: pcts.filter((p) => gradeFor(p).letter === letter).length,
  }));
  const maxBucket = Math.max(1, ...gradeBuckets.map((g) => g.count));

  const livePct = score !== "" && Number(maxScore) > 0 ? (Number(score) / Number(maxScore)) * 100 : null;
  const liveGrade = livePct !== null && livePct <= 100 && livePct >= 0 ? gradeFor(livePct) : null;

  function exportCsv() {
    downloadCsv(
      `acadance-results-${todayKey()}.csv`,
      ["Date", "Subject", "Assessment", "Type", "Score", "Out of", "Percent", "Grade"],
      sortedRecords.map((r) => {
        const p = percentOf(r) ?? 0;
        return [toDateKey(r.assessment_date), r.subject_name, r.assessment_name, r.source === "quiz" ? "Quiz" : "Test", Number(r.score), Number(r.max_score), p, gradeFor(p).letter];
      })
    );
    toast.info(`Exported ${sortedRecords.length} result${sortedRecords.length === 1 ? "" : "s"} to CSV.`);
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? <ArrowUpDown size={12} className="sort-icon idle" /> : sort.dir === "asc" ? <ArrowUp size={12} className="sort-icon" /> : <ArrowDown size={12} className="sort-icon" />;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Academic Tracking"
        title="Performance"
        subtitle="Every result, trend and subject insight in one place."
        actions={
          <>
            <button className="btn btn-outline" onClick={exportCsv} disabled={!sortedRecords.length}>
              <Download size={15} /> Export CSV
            </button>
            <button className="btn btn-primary" onClick={() => { resetForm(); formRef.current?.scrollIntoView({ behavior: "smooth" }); setTimeout(() => firstFieldRef.current?.focus(), 300); }}>
              <Plus size={15} /> Log result
            </button>
          </>
        }
      />

      {error && <div className="error-banner" style={{ marginBottom: 20 }} role="alert">{error}</div>}

      <section className="stat-grid" aria-label="Performance summary">
        <StatTile icon={Target} label="Average" value={avg !== null ? avg.toFixed(1) : "—"} unit={avg !== null ? "%" : undefined} hint={avg !== null ? gradeFor(avg).label : "No results"} spark={pcts.slice(-10)} loading={loading} accent="indigo" />
        <StatTile icon={Trophy} label="Best result" value={best ? Math.round(best.pct) : "—"} unit={best ? "%" : undefined} hint={best ? best.r.assessment_name : "—"} loading={loading} accent="green" />
        <StatTile icon={Clock3} label="Latest" value={latest ? Math.round(latest.pct) : "—"} unit={latest ? "%" : undefined} delta={latestDelta} deltaLabel="vs avg" hint={latest ? formatShortDate(latest.key) : undefined} loading={loading} accent="violet" />
        <StatTile icon={Hash} label="Results" value={filteredRecords.length} hint={`${subjectSummary.length} subject${subjectSummary.length === 1 ? "" : "s"}`} loading={loading} accent="teal" />
      </section>

      <div className="filter-bar" role="group" aria-label="Filter performance records">
        <div className="performance-filter segmented">
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
        <select className="filter-select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label="Filter by subject">
          <option value="all">All subjects</option>
          {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>)}
        </select>
        <label className="search-input">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assessments…" aria-label="Search assessments" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={13} /></button>}
        </label>
      </div>

      <div className="chart-grid">
        <div className="card chart-card span-2">
          <div className="card-head">
            <div>
              <h3>Trend over time</h3>
              <p className="card-sub">Score as % of the maximum mark{chartData.some((d) => d.rolling !== null) ? " · faint line is your 3-result rolling average" : ""}</p>
            </div>
          </div>
          {loading ? (
            <SkeletonChart height={280} />
          ) : chartData.length === 0 ? (
            <EmptyState icon={BarChart3} message="Add a result to see your trend line." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -2, bottom: 0 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} minTickGap={14} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} unit="%" width={52} />
                <ReferenceLine y={50} stroke={chart.axis} strokeDasharray="2 4" label={{ value: "Pass", position: "insideTopRight", fill: chart.axis, fontSize: 10 }} />
                <Tooltip cursor={{ stroke: chart.axis, strokeWidth: 1 }} content={<ChartTooltip titleKey="label" valueSuffix="%" footer={(row) => String(row.date ?? "")} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: chart.inkSoft, paddingTop: 6 }} />
                <Line type="monotone" name="Rolling avg" dataKey="rolling" stroke={chart.axis} strokeOpacity={0.55} strokeWidth={2} dot={false} activeDot={false} connectNulls legendType="plainline" />
                <Line
                  type="monotone"
                  name="Test"
                  dataKey="testPercentage"
                  stroke={chart.series[0]}
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 4, fill: chart.series[0], stroke: chart.surface, strokeWidth: 2 }}
                  activeDot={{ r: 6, stroke: chart.surface, strokeWidth: 2 }}
                />
                <Scatter name="Quiz" dataKey="quizPercentage" fill={chart.series[1]} shape="diamond" legendType="diamond" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card chart-card">
          <div className="card-head"><div><h3>By subject</h3><p className="card-sub">Average %, best subject first</p></div></div>
          {loading ? (
            <SkeletonChart height={240} />
          ) : subjectSummary.length === 0 ? (
            <EmptyState icon={BarChart3} message="No subject data yet." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, subjectSummary.length * 44)}>
              <BarChart data={subjectSummary} layout="vertical" margin={{ top: 0, right: 34, left: 0, bottom: 0 }} barCategoryGap={10}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="subject" width={110} tick={{ fontSize: 12, fill: chart.inkSoft }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: chart.grid }} content={<ChartTooltip titleKey="subject" valueSuffix="%" footer={(row) => `${row.count} results · best ${row.best}%`} />} />
                <Bar dataKey="average" name="Average" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fill: chart.inkSoft, fontSize: 11, formatter: (v: unknown) => `${Math.round(Number(v))}%` }}>
                  {subjectSummary.map((s) => <Cell key={s.subject} fill={chart.series[0]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card chart-card">
          <div className="card-head"><div><h3>Grade distribution</h3><p className="card-sub">How many results land in each band</p></div></div>
          {loading ? (
            <SkeletonChart height={200} />
          ) : !pcts.length ? (
            <EmptyState icon={BarChart3} message="No grades to show yet." />
          ) : (
            <div className="grade-columns" role="list">
              {gradeBuckets.map((g) => (
                <div key={g.letter} className="grade-column" role="listitem" title={`${g.count} result${g.count === 1 ? "" : "s"} graded ${g.letter}`}>
                  <span className="grade-count mono">{g.count}</span>
                  <div className="grade-column-track">
                    <div className={`grade-column-fill grade-${g.letter}`} style={{ height: `${(g.count / maxBucket) * 100}%` }} />
                  </div>
                  <span className="grade-letter">{g.letter}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card form-card" ref={formRef} style={{ marginBottom: 24 }}>
        <div className="card-head">
          <div>
            <h3>{editingId ? "Edit result" : "Add a result"}</h3>
            <p className="card-sub">{editingId ? "Update the details and save." : "Log a test or assignment score to keep your insights sharp."}</p>
          </div>
          {liveGrade && livePct !== null && (
            <div className={`live-grade tone-${liveGrade.tone}`} aria-live="polite">
              <strong>{Math.round(livePct)}%</strong>
              <span>{liveGrade.letter} · {liveGrade.label}</span>
            </div>
          )}
        </div>
        <form onSubmit={handleAddRecord} className="performance-form">
          <div className="form-row">
            <div>
              <label htmlFor="perf-subject">Subject</label>
              <select
                id="perf-subject"
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
                step="any"
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
                step="any"
                required
              />
            </div>
            <div>
              <label htmlFor="perf-date">Date</label>
              <input
                id="perf-date"
                type="date"
                value={assessmentDate}
                max={todayKey()}
                onChange={(e) => setAssessmentDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? (
                <Spinner label={editingId ? "Saving..." : "Adding..."} />
              ) : editingId ? (
                <><Save size={15} /> Save changes</>
              ) : (
                <><Plus size={15} /> Add result</>
              )}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary-inline" onClick={resetForm}>
                <X size={15} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>All results</h3>
            <p className="card-sub">{sortedRecords.length} of {records.length} shown</p>
          </div>
        </div>
        {loading ? (
          <Spinner label="Loading your results..." />
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            message={records.length === 0
              ? "No results yet — add your first one above."
              : search || subjectFilter !== "all"
                ? "No results match these filters."
                : `No ${recordFilter === "tests" ? "test" : "quiz"} results yet.`}
          />
        ) : (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th><button type="button" className="th-sort" onClick={() => toggleSort("subject")}>Subject <SortIcon k="subject" /></button></th>
                  <th><button type="button" className="th-sort" onClick={() => toggleSort("assessment")}>Assessment <SortIcon k="assessment" /></button></th>
                  <th>Score</th>
                  <th><button type="button" className="th-sort" onClick={() => toggleSort("pct")}>% <SortIcon k="pct" /></button></th>
                  <th><button type="button" className="th-sort" onClick={() => toggleSort("date")}>Date <SortIcon k="date" /></button></th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((r) => {
                  const p = percentOf(r) ?? 0;
                  const grade = gradeFor(p);
                  return (
                    <tr key={r.record_id} className={editingId === r.record_id ? "row-editing" : ""}>
                      <td><span className="subject-chip">{r.subject_name}</span></td>
                      <td>{r.assessment_name}{r.source === "quiz" && <small className="performance-source-badge">Quiz</small>}</td>
                      <td className="mono">
                        {Number(r.score)}/{Number(r.max_score)}
                      </td>
                      <td>
                        <span className={`score-pill tone-${grade.tone}`}>{Math.round(p)}%</span>
                        <span className="pct-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, p)}%` }} /></span>
                      </td>
                      <td className="mono" title={formatLongDate(r.assessment_date)}>{toDateKey(r.assessment_date)}</td>
                      <td>
                        {r.source === "quiz" ? (
                          <span className="performance-readonly">From quiz attempt</span>
                        ) : pendingDelete === r.record_id ? (
                          <span className="row-actions confirm">
                            <span>Delete?</span>
                            <button className="delete-btn" onClick={() => handleDelete(r.record_id)} aria-label={`Confirm delete ${r.assessment_name}`}>Yes</button>
                            <button className="ghost-btn" onClick={() => setPendingDelete(null)}>No</button>
                          </span>
                        ) : (
                          <span className="row-actions">
                            <button className="ghost-btn" onClick={() => startEdit(r)} aria-label={`Edit ${r.assessment_name}`}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              className="delete-btn"
                              onClick={() => setPendingDelete(r.record_id)}
                              aria-label={`Delete ${r.assessment_name}`}
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
