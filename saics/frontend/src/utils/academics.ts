// Pure helpers for turning raw performance / quiz rows into the numbers
// the dashboards show. Kept framework-free so every page computes the
// same "average", "trend" and "grade" the same way.

export interface ScoredRow {
  score: number | string | null;
  max_score: number | string | null;
}

export interface DatedScoredRow extends ScoredRow {
  assessment_date: string;
  subject_name: string;
  source?: "manual" | "quiz";
}

/** Percentage 0–100 (one decimal), or null when the row can't be scored. */
export function percentOf(row: ScoredRow): number | null {
  const score = Number(row.score);
  const max = Number(row.max_score);
  if (row.score === null || row.max_score === null) return null;
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((score / max) * 1000) / 10;
}

export function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/** Least-squares slope in percentage points per assessment. */
export function trendSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export type GradeTone = "excellent" | "good" | "fair" | "weak";

export function gradeFor(percent: number): { letter: string; tone: GradeTone; label: string } {
  if (percent >= 80) return { letter: "A", tone: "excellent", label: "Distinction" };
  if (percent >= 70) return { letter: "B", tone: "good", label: "Merit" };
  if (percent >= 60) return { letter: "C", tone: "good", label: "Credit" };
  if (percent >= 50) return { letter: "D", tone: "fair", label: "Pass" };
  return { letter: "F", tone: "weak", label: "Below pass" };
}

export interface SubjectSummary {
  subject: string;
  average: number;
  best: number;
  count: number;
  latest: number;
}

export function summariseBySubject(rows: DatedScoredRow[]): SubjectSummary[] {
  const groups = new Map<string, { values: number[]; dated: { date: string; p: number }[] }>();
  for (const row of rows) {
    const p = percentOf(row);
    if (p === null) continue;
    const key = row.subject_name || "Other";
    const g = groups.get(key) ?? { values: [], dated: [] };
    g.values.push(p);
    g.dated.push({ date: toDateKey(row.assessment_date), p });
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([subject, g]) => {
      const sorted = [...g.dated].sort((a, b) => a.date.localeCompare(b.date));
      return {
        subject,
        average: average(g.values) ?? 0,
        best: Math.max(...g.values),
        count: g.values.length,
        latest: sorted[sorted.length - 1]?.p ?? 0,
      };
    })
    .sort((a, b) => b.average - a.average);
}

/** Normalise anything date-like (ISO timestamp, Date string) to YYYY-MM-DD. */
export function toDateKey(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatShortDate(value: string | null | undefined): string {
  const key = toDateKey(value);
  if (!key) return "—";
  const d = new Date(key + "T00:00:00");
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatLongDate(value: string | null | undefined): string {
  const key = toDateKey(value);
  if (!key) return "—";
  const d = new Date(key + "T00:00:00");
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function todayKey(): string {
  return toDateKey(new Date().toISOString());
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Quote-safe CSV download, entirely client side. */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (cell: string | number) => {
    const text = String(cell ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
