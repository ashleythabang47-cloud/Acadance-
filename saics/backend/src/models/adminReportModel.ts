import { RowDataPacket } from "mysql2";
import { pool } from "../config/db";

export type AdminReportType =
  | "user-activity"
  | "academic-performance"
  | "quiz"
  | "at-risk"
  | "ai-usage"
  | "audit-summary";

export interface AdminReportRange {
  from: string;
  to: string;
}

export interface AdminReportFilters {
  subjectId?: number;
  provider?: "groq" | "gemini" | "ollama" | "local-engine";
  operation?: "generation" | "grading";
  role?: "student" | "admin";
  level?: "low" | "medium" | "high" | "insufficient_data";
}

export interface AdminReportSection {
  title: string;
  columns: string[];
  rows: RowDataPacket[];
}

export interface AdminReportData {
  title: string;
  summary: Record<string, number | string | null>;
  sections: AdminReportSection[];
  total: number;
}

function rangeWhere(column: string) {
  return `${column} >= ? AND ${column} < DATE_ADD(?, INTERVAL 1 DAY)`;
}

export const AdminReportModel = {
  async userActivity(range: AdminReportRange, filters: AdminReportFilters): Promise<AdminReportData> {
    const roleClause = filters.role ? " AND role = ?" : "";
    const roleValues = filters.role ? [filters.role] : [];
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS signups,
         COALESCE(SUM(email_verified = TRUE), 0) AS verified,
         COALESCE(SUM(email_verified = FALSE), 0) AS unverified,
         (SELECT COUNT(*) FROM students
          WHERE ${rangeWhere("last_login_at")}${roleClause}) AS active_users,
         (SELECT COUNT(*) FROM students WHERE is_suspended = TRUE AND deleted_at IS NULL${roleClause}) AS suspended_users
       FROM students
       WHERE ${rangeWhere("created_at")}${roleClause}`,
      [range.from, range.to, ...roleValues, ...roleValues, range.from, range.to, ...roleValues]
    );
    const [dailyRows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(created_at) AS day, COUNT(*) AS signups,
              SUM(email_verified = TRUE) AS verified,
              SUM(email_verified = FALSE) AS unverified
       FROM students
       WHERE ${rangeWhere("created_at")}${roleClause}
       GROUP BY DATE(created_at) ORDER BY day`,
      [range.from, range.to, ...roleValues]
    );
    const [changeRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(before_values, '$.role')), '') <>
                      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(after_values, '$.role')), '')), 0) AS role_changes,
         COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(after_values, '$.is_suspended')) = 'true' AND
                      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(before_values, '$.is_suspended')), '') <> 'true'), 0) AS suspensions
       FROM audit_logs
       WHERE action = 'admin.user.update' AND ${rangeWhere("created_at")}`,
      [range.from, range.to]
    );
    const summary = {
      signups: Number(summaryRows[0]?.signups ?? 0),
      verified: Number(summaryRows[0]?.verified ?? 0),
      unverified: Number(summaryRows[0]?.unverified ?? 0),
      active_users: Number(summaryRows[0]?.active_users ?? 0),
      suspended_users: Number(summaryRows[0]?.suspended_users ?? 0),
      role_changes: Number(changeRows[0]?.role_changes ?? 0),
      suspensions: Number(changeRows[0]?.suspensions ?? 0),
    };
    return {
      title: "User activity",
      summary,
      sections: [{
        title: "Signups by day",
        columns: ["day", "signups", "verified", "unverified"],
        rows: dailyRows,
      }],
      total: dailyRows.length,
    };
  },

  async academicPerformance(range: AdminReportRange, filters: AdminReportFilters): Promise<AdminReportData> {
    const subjectClause = filters.subjectId ? " AND pr.subject_id = ?" : "";
    const values: (string | number)[] = [range.from, range.to];
    if (filters.subjectId) values.push(filters.subjectId);
    const [subjectRows] = await pool.query<RowDataPacket[]>(
      `SELECT s.subject_id, s.subject_name, COUNT(*) AS records,
              ROUND(AVG(pr.score / NULLIF(pr.max_score, 0) * 100), 1) AS average_score
       FROM performance_records pr
       JOIN subjects s ON s.subject_id = pr.subject_id
       WHERE ${rangeWhere("pr.assessment_date")} AND pr.max_score > 0${subjectClause}
       GROUP BY s.subject_id, s.subject_name
       ORDER BY s.subject_name LIMIT 1000`,
      values
    );
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS records,
              ROUND(AVG(score / NULLIF(max_score, 0) * 100), 1) AS average_score
       FROM performance_records pr
       WHERE ${rangeWhere("pr.assessment_date")} AND max_score > 0${subjectClause}`,
      values
    );
    const [distributionRows] = await pool.query<RowDataPacket[]>(
      `SELECT CASE
                WHEN score / NULLIF(max_score, 0) < 0.5 THEN '0-49%'
                WHEN score / NULLIF(max_score, 0) < 0.7 THEN '50-69%'
                WHEN score / NULLIF(max_score, 0) < 0.9 THEN '70-89%'
                ELSE '90-100%'
              END AS score_band, COUNT(*) AS records
       FROM performance_records pr
       WHERE ${rangeWhere("pr.assessment_date")} AND max_score > 0${subjectClause}
       GROUP BY score_band
       ORDER BY MIN(score / NULLIF(max_score, 0))`,
      values
    );
    const [trendRows] = await pool.query<RowDataPacket[]>(
      `SELECT assessment_date AS day,
              ROUND(AVG(score / NULLIF(max_score, 0) * 100), 1) AS average_score,
              COUNT(*) AS records
       FROM performance_records pr
       WHERE ${rangeWhere("pr.assessment_date")} AND max_score > 0${subjectClause}
       GROUP BY assessment_date ORDER BY assessment_date LIMIT 366`,
      values
    );
    return {
      title: "Academic performance",
      summary: summaryRows[0],
      sections: [
        { title: "Average by subject", columns: ["subject_name", "records", "average_score"], rows: subjectRows },
        { title: "Score distribution", columns: ["score_band", "records"], rows: distributionRows },
        { title: "Trend by day", columns: ["day", "average_score", "records"], rows: trendRows },
      ],
      total: subjectRows.length,
    };
  },

  async quiz(range: AdminReportRange, filters: AdminReportFilters): Promise<AdminReportData> {
    const subjectClause = filters.subjectId ? " AND q.subject_id = ?" : "";
    const values: (string | number)[] = [range.from, range.to];
    if (filters.subjectId) values.push(filters.subjectId);
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS quizzes_taken,
              COALESCE(SUM(grading_status = 'completed'), 0) AS completed,
              COALESCE(SUM(grading_status = 'pending'), 0) AS pending_grading,
              ROUND(AVG(IF(grading_status = 'completed' AND max_score > 0,
                           score / max_score * 100, NULL)), 1) AS average_score,
              ROUND(100 * SUM(grading_status = 'completed' AND max_score > 0 AND score / max_score >= 0.5) /
                    NULLIF(SUM(grading_status = 'completed' AND max_score > 0), 0), 1) AS pass_rate
       FROM quiz_attempts qa
       JOIN quizzes q ON q.quiz_id = qa.quiz_id
       WHERE ${rangeWhere("qa.started_at")}${subjectClause}`,
      values
    );
    const [quizRows] = await pool.query<RowDataPacket[]>(
      `SELECT q.quiz_id, q.title, s.subject_name, COUNT(qa.attempt_id) AS attempts,
              ROUND(AVG(IF(qa.grading_status = 'completed' AND qa.max_score > 0,
                           qa.score / qa.max_score * 100, NULL)), 1) AS average_score
       FROM quizzes q
       JOIN subjects s ON s.subject_id = q.subject_id
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.quiz_id AND ${rangeWhere("qa.started_at")}
       WHERE q.deleted_at IS NULL AND q.is_hidden = FALSE${subjectClause}
       GROUP BY q.quiz_id, q.title, s.subject_name
       ORDER BY attempts DESC, q.title LIMIT 1000`,
      [...[range.from, range.to], ...values.slice(2)]
    );
    const mostAttempted = quizRows[0]?.title ?? null;
    const leastAttempted = [...quizRows].sort(
      (left, right) => Number(left.attempts) - Number(right.attempts)
    )[0]?.title ?? null;
    return {
      title: "Quiz report",
      summary: {
        quizzes_taken: Number(summaryRows[0]?.quizzes_taken ?? 0),
        completed: Number(summaryRows[0]?.completed ?? 0),
        pending_grading: Number(summaryRows[0]?.pending_grading ?? 0),
        average_score: summaryRows[0]?.average_score == null ? null : Number(summaryRows[0].average_score),
        pass_rate: summaryRows[0]?.pass_rate == null ? null : Number(summaryRows[0].pass_rate),
        most_attempted: mostAttempted,
        least_attempted: leastAttempted,
      },
      sections: [{
        title: "Attempts by quiz",
        columns: ["title", "subject_name", "attempts", "average_score"],
        rows: quizRows,
      }],
      total: quizRows.length,
    };
  },

  async aiUsage(range: AdminReportRange, filters: AdminReportFilters): Promise<AdminReportData> {
    const clauses = [rangeWhere("created_at")];
    const values: (string | number)[] = [range.from, range.to];
    if (filters.provider) {
      clauses.push("provider = ?");
      values.push(filters.provider);
    }
    if (filters.operation) {
      clauses.push("operation = ?");
      values.push(filters.operation);
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(created_at) AS day, provider, operation, COUNT(*) AS requests,
              SUM(succeeded = TRUE) AS succeeded,
              SUM(succeeded = FALSE) AS failed,
              SUM(rate_limited = TRUE) AS rate_limited
       FROM ai_provider_events
       WHERE ${clauses.join(" AND ")}
       GROUP BY DATE(created_at), provider, operation
       ORDER BY day, provider, operation LIMIT 3000`,
      values
    );
    const summary = rows.reduce((totals, row) => ({
      requests: totals.requests + Number(row.requests ?? 0),
      succeeded: totals.succeeded + Number(row.succeeded ?? 0),
      failed: totals.failed + Number(row.failed ?? 0),
      rate_limited: totals.rate_limited + Number(row.rate_limited ?? 0),
    }), { requests: 0, succeeded: 0, failed: 0, rate_limited: 0 });
    return {
      title: "AI usage",
      summary,
      sections: [{
        title: "Requests per provider and day",
        columns: ["day", "provider", "operation", "requests", "succeeded", "failed", "rate_limited"],
        rows,
      }],
      total: rows.length,
    };
  },

  async auditSummary(range: AdminReportRange): Promise<AdminReportData> {
    const [actionRows] = await pool.query<RowDataPacket[]>(
      `SELECT action, COUNT(*) AS actions
       FROM audit_logs
       WHERE ${rangeWhere("created_at")}
       GROUP BY action ORDER BY actions DESC, action LIMIT 1000`,
      [range.from, range.to]
    );
    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT al.actor_id, COALESCE(s.full_name, 'System') AS admin_name,
              COUNT(*) AS actions
       FROM audit_logs al
       LEFT JOIN students s ON s.student_id = al.actor_id
       WHERE ${rangeWhere("al.created_at")}
       GROUP BY al.actor_id, s.full_name
       ORDER BY actions DESC, admin_name LIMIT 1000`,
      [range.from, range.to]
    );
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_actions
       FROM audit_logs WHERE ${rangeWhere("created_at")}`,
      [range.from, range.to]
    );
    return {
      title: "Audit summary",
      summary: summaryRows[0],
      sections: [
        { title: "Actions by type", columns: ["action", "actions"], rows: actionRows },
        { title: "Actions by admin", columns: ["admin_name", "actions"], rows: adminRows },
      ],
      total: actionRows.length + adminRows.length,
    };
  },
};
