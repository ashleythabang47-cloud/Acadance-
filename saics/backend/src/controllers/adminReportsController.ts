import { Response } from "express";
import PDFDocument from "pdfkit";
import { RowDataPacket } from "mysql2";
import { pool } from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";
import {
  AdminReportData,
  AdminReportFilters,
  AdminReportModel,
  AdminReportRange,
  AdminReportSection,
  AdminReportType,
} from "../models/adminReportModel";
import { RiskAnalysisModel } from "../models/riskAnalysisModel";
import { calculateRisk } from "../services/riskAnalysis";
import { recordAudit } from "../services/auditLog";

const REPORT_TYPES: AdminReportType[] = [
  "user-activity",
  "academic-performance",
  "quiz",
  "at-risk",
  "ai-usage",
  "audit-summary",
];
const PAGE_LIMIT = 100;
const EXPORT_ROW_LIMIT = 10_000;

interface ReportResponse {
  type: AdminReportType;
  title: string;
  range: AdminReportRange;
  generatedAt: string;
  generatedBy: string;
  summary: Record<string, number | string | null>;
  sections: AdminReportSection[];
  page: number;
  limit: number;
  total: number;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePage(query: AuthRequest["query"]): { page: number; limit: number } {
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Number(query.page) : 1;
  const requestedLimit = typeof query.limit === "string" && /^\d+$/.test(query.limit)
    ? Number(query.limit)
    : PAGE_LIMIT;
  return {
    page: Math.max(1, Math.min(1_000_000, page)),
    limit: Math.max(1, Math.min(PAGE_LIMIT, requestedLimit)),
  };
}

function parseFilters(req: AuthRequest, res: Response): AdminReportFilters | null {
  const filters: AdminReportFilters = {};
  const { type } = req.params;
  if (req.query.subjectId !== undefined) {
    const subjectId = typeof req.query.subjectId === "string" && /^\d+$/.test(req.query.subjectId)
      ? Number(req.query.subjectId)
      : 0;
    if (subjectId < 1 || !["academic-performance", "quiz", "at-risk"].includes(type)) {
      res.status(400).json({ message: "subjectId must be a positive id supported by this report." });
      return null;
    }
    filters.subjectId = subjectId;
  }
  if (req.query.provider !== undefined) {
    if (!["groq", "gemini", "ollama", "local-engine"].includes(String(req.query.provider)) || type !== "ai-usage") {
      res.status(400).json({ message: "provider must be groq, gemini, ollama or local-engine for the AI usage report." });
      return null;
    }
    filters.provider = req.query.provider as AdminReportFilters["provider"];
  }
  if (req.query.operation !== undefined) {
    if (!["generation", "grading"].includes(String(req.query.operation)) || type !== "ai-usage") {
      res.status(400).json({ message: "operation must be generation or grading for the AI usage report." });
      return null;
    }
    filters.operation = req.query.operation as AdminReportFilters["operation"];
  }
  if (req.query.role !== undefined) {
    if (!["student", "admin"].includes(String(req.query.role)) || type !== "user-activity") {
      res.status(400).json({ message: "role must be student or admin for the user activity report." });
      return null;
    }
    filters.role = req.query.role as AdminReportFilters["role"];
  }
  if (req.query.level !== undefined) {
    if (!["low", "medium", "high", "insufficient_data"].includes(String(req.query.level)) || type !== "at-risk") {
      res.status(400).json({ message: "level is invalid for the at-risk report." });
      return null;
    }
    filters.level = req.query.level as AdminReportFilters["level"];
  }
  return filters;
}

async function getAtRiskReport(filters: AdminReportFilters): Promise<AdminReportData> {
  const students = await RiskAnalysisModel.findAllStudents();
  const rows: RowDataPacket[] = students.flatMap((student) => {
    const analysis = calculateRisk(student.input);
    if (filters.level && analysis.level !== filters.level) return [];
    if (filters.subjectId !== undefined &&
        !student.input.performanceRecords.some((record) => record.subjectId === filters.subjectId)) return [];
    const level = analysis.level;
    const reasons = level === "insufficient_data"
      ? ["Not enough assessment records to calculate current risk."]
      : analysis.reasons;
    return [{
      student_id: student.studentId,
      full_name: student.fullName,
      email: student.email,
      risk_level: level,
      risk_score: level === "insufficient_data" ? null : analysis.score,
      reasons: reasons.join(" "),
    } as RowDataPacket];
  }).sort((left, right) => {
    const rank = { high: 0, medium: 1, low: 2, insufficient_data: 3 };
    const levelOrder = rank[left.risk_level as keyof typeof rank] - rank[right.risk_level as keyof typeof rank];
    return levelOrder || Number(right.risk_score ?? -1) - Number(left.risk_score ?? -1);
  });
  const counts = rows.reduce<Record<string, number>>((summary, row) => {
    const level = String(row.risk_level);
    summary[level] = (summary[level] ?? 0) + 1;
    return summary;
  }, {});
  return {
    title: "At-risk students",
    summary: {
      high: counts.high ?? 0,
      medium: counts.medium ?? 0,
      low: counts.low ?? 0,
      insufficient_data: counts.insufficient_data ?? 0,
      students: rows.length,
    },
    sections: [{
      title: "Current risk levels and reasons",
      columns: ["full_name", "email", "risk_level", "risk_score", "reasons"],
      rows,
    }],
    total: rows.length,
  };
}

async function getReport(type: AdminReportType, range: AdminReportRange, filters: AdminReportFilters) {
  if (type === "user-activity") return AdminReportModel.userActivity(range, filters);
  if (type === "academic-performance") return AdminReportModel.academicPerformance(range, filters);
  if (type === "quiz") return AdminReportModel.quiz(range, filters);
  if (type === "ai-usage") return AdminReportModel.aiUsage(range, filters);
  if (type === "audit-summary") return AdminReportModel.auditSummary(range);
  return getAtRiskReport(filters);
}

function safeCsvCell(value: unknown): string {
  const text = value == null
    ? ""
    : typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const safe = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvFor(report: ReportResponse): string {
  const lines = [
    `"Report","${report.title.replace(/"/g, '""')}"`,
    `"From",${safeCsvCell(report.range.from)}`,
    `"To",${safeCsvCell(report.range.to)}`,
    `"Generated at",${safeCsvCell(report.generatedAt)}`,
    `"Generated by",${safeCsvCell(report.generatedBy)}`,
    "",
    "Summary",
    ...Object.entries(report.summary).map(([key, value]) => `${safeCsvCell(key)},${safeCsvCell(value)}`),
  ];
  for (const section of report.sections) {
    lines.push("", safeCsvCell(section.title), section.columns.map(safeCsvCell).join(","));
    for (const row of section.rows) {
      lines.push(section.columns.map((column) => safeCsvCell(row[column])).join(","));
    }
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function pdfFor(report: ReportResponse): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.fontSize(20).text(report.title, { continued: false });
    document.moveDown(0.5).fontSize(10)
      .text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`)
      .text(`Date range: ${report.range.from} to ${report.range.to}`)
      .text(`Generated by: ${report.generatedBy}`);
    for (const [key, value] of Object.entries(report.summary)) {
      document.text(`${key.replace(/_/g, " ")}: ${String(value ?? "—")}`);
    }
    for (const section of report.sections) {
      document.moveDown().fontSize(14).text(section.title);
      document.moveDown(0.3).fontSize(8).text(section.columns.join(" | "));
      document.moveTo(48, document.y + 2).lineTo(547, document.y + 2).stroke();
      for (const row of section.rows) {
        const content = section.columns.map((column) => {
          const value = row[column];
          return `${column}: ${value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)}`;
        }).join(" | ");
        const height = document.heightOfString(content, { width: 495 });
        if (document.y + height + 12 > document.page.height - 48) document.addPage();
        document.moveDown(0.4).fontSize(8).text(content, { width: 495 });
      }
    }
    document.end();
  });
}

export async function generateAdminReport(req: AuthRequest, res: Response) {
  const type = req.params.type as AdminReportType;
  if (!REPORT_TYPES.includes(type)) {
    return res.status(400).json({ message: "Choose a valid report type." });
  }
  const from = req.query.from;
  const to = req.query.to;
  if (!isDate(from) || !isDate(to)) {
    return res.status(400).json({ message: "from and to must be valid dates in YYYY-MM-DD format." });
  }
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (days < 1 || days > 366) {
    return res.status(400).json({ message: "Date range must be ordered and no longer than 366 days." });
  }
  const format = req.query.format === undefined ? "json" : req.query.format;
  if (format !== "json" && format !== "csv" && format !== "pdf") {
    return res.status(400).json({ message: "format must be json, csv or pdf." });
  }
  const filters = parseFilters(req, res);
  if (!filters) return;
  const { page, limit } = parsePage(req.query);
  if (req.query.page !== undefined && (typeof req.query.page !== "string" || !/^\d+$/.test(req.query.page))) {
    return res.status(400).json({ message: "page must be a positive integer." });
  }
  if (req.query.limit !== undefined && (typeof req.query.limit !== "string" || !/^\d+$/.test(req.query.limit))) {
    return res.status(400).json({ message: "limit must be a positive integer." });
  }
  if ((req.query.page !== undefined && Number(req.query.page) < 1) ||
      (req.query.limit !== undefined && Number(req.query.limit) < 1)) {
    return res.status(400).json({ message: "page and limit must be positive integers." });
  }

  try {
    const range = { from, to };
    const data = await getReport(type, range, filters);
    const generatedAt = new Date().toISOString();
    const [[admin]] = await pool.query<RowDataPacket[]>(
      `SELECT full_name FROM students WHERE student_id = ? LIMIT 1`,
      [req.studentId]
    );
    const generatedBy = String(admin?.full_name ?? `Admin ${req.studentId}`);
    const pageSize = format === "json" ? limit : EXPORT_ROW_LIMIT;
    const sections = data.sections.map((section) => ({
      ...section,
      rows: format === "json" && section.title === "Trend by day"
        ? section.rows
        : section.rows.slice(format === "json" ? (page - 1) * pageSize : 0, page * pageSize),
    }));
    const report: ReportResponse = {
      type,
      title: data.title,
      range,
      generatedAt,
      generatedBy,
      summary: data.summary,
      sections,
      page,
      limit: pageSize,
      total: data.total,
    };
    if (format === "csv") {
      const csv = csvFor(report);
      await recordAudit({
        actorId: req.studentId,
        targetType: "report",
        action: "admin.report.generate",
        after: { reportType: type, from, to, format },
        ipAddress: req.ip,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-report.csv"`);
      return res.send(csv);
    }
    if (format === "pdf") {
      const pdf = await pdfFor(report);
      await recordAudit({
        actorId: req.studentId,
        targetType: "report",
        action: "admin.report.generate",
        after: { reportType: type, from, to, format },
        ipAddress: req.ip,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-report.pdf"`);
      return res.send(pdf);
    }
    await recordAudit({
      actorId: req.studentId,
      targetType: "report",
      action: "admin.report.generate",
      after: { reportType: type, from, to, format },
      ipAddress: req.ip,
    });
    return res.json(report);
  } catch (error) {
    console.error("Could not generate admin report.", error);
    return res.status(500).json({ message: "Could not generate this report." });
  }
}
