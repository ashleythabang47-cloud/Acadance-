import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileText, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import Spinner from "../components/Spinner";

type ReportType =
  | "user-activity"
  | "academic-performance"
  | "quiz"
  | "at-risk"
  | "ai-usage"
  | "audit-summary";

type ReportRow = Record<string, unknown>;

interface ReportSection {
  title: string;
  columns: string[];
  rows: ReportRow[];
}

interface Report {
  type: ReportType;
  title: string;
  range: { from: string; to: string };
  generatedAt: string;
  generatedBy: string;
  summary: Record<string, number | string | null>;
  sections: ReportSection[];
  page: number;
  limit: number;
  total: number;
}

const reportTypes: { value: ReportType; label: string; description: string }[] = [
  { value: "user-activity", label: "User activity", description: "Signups, verification, active users, suspensions, and role changes." },
  { value: "academic-performance", label: "Academic performance", description: "Subject averages, score distribution, and score trends." },
  { value: "quiz", label: "Quiz report", description: "Attempts, scores, pass rate, pending grading, and quiz popularity." },
  { value: "at-risk", label: "At-risk students", description: "Current risk levels and the reasons behind them." },
  { value: "ai-usage", label: "AI usage", description: "Daily provider requests, successes, failures, and rate limits." },
  { value: "audit-summary", label: "Audit summary", description: "Admin action counts grouped by action and administrator." },
];

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: localDate(from), to: localDate(to) };
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function safeFileName(value: ReportType) {
  return `${value}-report`;
}

export default function AdminReports() {
  const [type, setType] = useState<ReportType>("user-activity");
  const [range, setRange] = useState(defaultRange);
  const [subjectId, setSubjectId] = useState("");
  const [role, setRole] = useState("");
  const [provider, setProvider] = useState("");
  const [operation, setOperation] = useState("");
  const [level, setLevel] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | "">("");
  const [error, setError] = useState("");

  function parameters(page = 1, format = "json") {
    const params: Record<string, string | number> = {
      from: range.from,
      to: range.to,
      format,
    };
    if (format === "json") params.page = page;
    if (subjectId && ["academic-performance", "quiz", "at-risk"].includes(type)) {
      params.subjectId = subjectId;
    }
    if (role && type === "user-activity") params.role = role;
    if (provider && type === "ai-usage") params.provider = provider;
    if (operation && type === "ai-usage") params.operation = operation;
    if (level && type === "at-risk") params.level = level;
    return params;
  }

  async function generate(page = 1) {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/admin/reports/${type}`, { params: parameters(page) });
      setReport(response.data as Report);
    } catch (requestError) {
      const err = requestError as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? "Could not generate this report. Please try again.");
      if (page === 1) setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportReport(format: "csv" | "pdf") {
    setExporting(format);
    setError("");
    try {
      const response = await api.get(`/admin/reports/${type}`, {
        params: parameters(1, format),
        responseType: "blob",
      });
      const mimeType = format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8";
      const blob = new Blob([response.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(type)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Could not export the ${format.toUpperCase()} report.`);
    } finally {
      setExporting("");
    }
  }

  const selected = reportTypes.find((item) => item.value === type)!;
  const trend = report?.sections.find((section) => section.title === "Trend by day");
  const activeSection = report?.sections[0];
  const pageCount = report ? Math.max(1, Math.ceil(report.total / report.limit)) : 1;

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">INSIGHTS</p>
          <h1>Reports</h1>
          <p>Generate, review, and export platform reports.</p>
        </div>
      </div>

      <section className="admin-panel admin-report-form">
        <div className="admin-report-form-grid">
          <label>
            Report type
            <select value={type} onChange={(event) => {
              setType(event.target.value as ReportType);
              setReport(null);
              setError("");
            }}>
              {reportTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            From
            <input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label>
            To
            <input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
          </label>
          {["academic-performance", "quiz", "at-risk"].includes(type) && (
            <label>
              Subject ID (optional)
              <input type="number" min="1" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} placeholder="All subjects" />
            </label>
          )}
          {type === "user-activity" && (
            <label>
              Role (optional)
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="">All roles</option>
                <option value="student">Students</option>
                <option value="admin">Admins</option>
              </select>
            </label>
          )}
          {type === "ai-usage" && <>
            <label>
              Provider (optional)
              <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                <option value="">All providers</option>
                <option value="groq">Groq</option>
                <option value="gemini">Gemini</option>
                <option value="ollama">Ollama</option>
              </select>
            </label>
            <label>
              Operation (optional)
              <select value={operation} onChange={(event) => setOperation(event.target.value)}>
                <option value="">All operations</option>
                <option value="generation">Generation</option>
                <option value="grading">Grading</option>
              </select>
            </label>
          </>}
          {type === "at-risk" && (
            <label>
              Risk level (optional)
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="">All levels</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="insufficient_data">Insufficient data</option>
              </select>
            </label>
          )}
        </div>
        <p className="admin-report-description">{selected.description}</p>
        <button className="admin-button primary" onClick={() => void generate()} disabled={loading || !range.from || !range.to}>
          {loading ? <Spinner label="Generating..." /> : <><FileText size={15} /> Generate report</>}
        </button>
      </section>

      {error && <div className="admin-panel admin-report-error" role="alert">{error}</div>}
      {!report && !loading && !error && (
        <div className="admin-panel admin-state"><div className="admin-empty-icon"><FileText size={21} /></div><strong>Ready when you are</strong><p>Choose a report and date range, then generate it to see results here.</p></div>
      )}
      {loading && <div className="admin-panel admin-state"><Spinner label="Generating report..." /></div>}
      {report && !loading && <>
        <div className="admin-report-heading">
          <div>
            <h2>{report.title}</h2>
            <p>{report.range.from} – {report.range.to} · Generated {new Date(report.generatedAt).toLocaleString()}</p>
          </div>
          <div className="admin-report-actions">
            <button className="admin-button secondary" onClick={() => void exportReport("csv")} disabled={Boolean(exporting)}>
              {exporting === "csv" ? <Spinner label="Exporting..." /> : <><Download size={15} /> Export CSV</>}
            </button>
            <button className="admin-button secondary" onClick={() => void exportReport("pdf")} disabled={Boolean(exporting)}>
              {exporting === "pdf" ? <Spinner label="Exporting..." /> : <><Download size={15} /> Export PDF</>}
            </button>
          </div>
        </div>

        <div className="admin-report-summary">
          {Object.entries(report.summary).map(([key, value]) => (
            <article className="admin-panel admin-report-stat" key={key}>
              <span>{key.replace(/_/g, " ")}</span>
              <strong>{formatValue(value)}</strong>
            </article>
          ))}
        </div>

        {trend && trend.rows.length > 0 && (
          <section className="admin-panel admin-report-chart">
            <h2>{trend.title}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend.rows}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="average_score" name="Average score" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}

        {report.sections.map((section) => (
          <section className="admin-content-section" key={section.title}>
            <div className="admin-section-heading">
              <div><h2>{section.title}</h2><p>{section.rows.length} rows on this page</p></div>
              {section === activeSection && <button className="admin-icon-button" aria-label="Refresh report" onClick={() => void generate(report.page)}><RefreshCw size={16} /></button>}
            </div>
            {section.rows.length === 0 ? (
              <div className="admin-panel admin-state"><strong>No data for this range</strong><p>Try adjusting the date range or filters.</p></div>
            ) : (
              <div className="admin-panel admin-table-panel">
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead><tr>{section.columns.map((column) => <th key={column}>{column.replace(/_/g, " ")}</th>)}</tr></thead>
                    <tbody>{section.rows.map((row, index) => (
                      <tr key={`${section.title}-${index}`}>
                        {section.columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ))}
        {report.total > report.limit && (
          <div className="admin-pagination">
            <span>Showing {(report.page - 1) * report.limit + 1}–{Math.min(report.page * report.limit, report.total)} of {report.total}</span>
            <div>
              <button disabled={report.page <= 1 || loading} onClick={() => void generate(report.page - 1)}>Previous</button>
              <span>Page {report.page} of {pageCount}</span>
              <button disabled={report.page >= pageCount || loading} onClick={() => void generate(report.page + 1)}>Next</button>
            </div>
          </div>
        )}
      </>}
    </>
  );
}
