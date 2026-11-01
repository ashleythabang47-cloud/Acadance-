import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { RiskAnalysisModel } from "../models/riskAnalysisModel";
import { calculateRisk, RiskAnalysisLevel, RiskAnalysisResult } from "../services/riskAnalysis";

function isRiskResult(result: ReturnType<typeof calculateRisk>): result is RiskAnalysisResult {
  return result.level !== "insufficient_data";
}

function topReason(result: RiskAnalysisResult): string {
  return result.reasons.find((reason) => /declined|no recorded|quiz average/i.test(reason))
    ?? result.reasons[0];
}

function pagination(query: AuthRequest["query"]) {
  const parsedPage = Number.parseInt(String(query.page ?? "1"), 10);
  const parsedLimit = Number.parseInt(String(query.limit ?? "25"), 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 25;
  return { page, limit, offset: (page - 1) * limit };
}

export async function getMyRiskAnalysis(req: AuthRequest, res: Response) {
  try {
    const input = await RiskAnalysisModel.findForStudent(req.studentId!);
    const analysis = calculateRisk(input);
    const level: RiskAnalysisLevel = analysis.level;
    await RiskAnalysisModel.syncStudentLevel({
      studentId: req.studentId!,
      level,
      topReason: isRiskResult(analysis) ? topReason(analysis) : "Your academic records indicate high risk.",
    });
    return res.status(200).json({ analysis });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Could not load your risk analysis." });
  }
}

export async function listAtRiskStudents(req: AuthRequest, res: Response) {
  const requestedLevel = typeof req.query.level === "string" ? req.query.level.toLowerCase() : "";
  if (requestedLevel && !["low", "medium", "high"].includes(requestedLevel)) {
    return res.status(400).json({ message: "Level must be low, medium or high." });
  }
  const subjectId = typeof req.query.subjectId === "string" && /^\d+$/.test(req.query.subjectId)
    ? Number(req.query.subjectId)
    : null;
  if (req.query.subjectId !== undefined && subjectId === null) {
    return res.status(400).json({ message: "Subject filter must be a valid subject id." });
  }

  try {
    const students = await RiskAnalysisModel.findAllStudents();
    const analyses = students.map((student) => ({
      student,
      analysis: calculateRisk(student.input),
    }));
    await RiskAnalysisModel.syncAllLevels(analyses.map(({ student, analysis }) => ({
      studentId: student.studentId,
      level: analysis.level,
      topReason: isRiskResult(analysis) ? topReason(analysis) : "Your academic records indicate high risk.",
    })));

    const subjects = new Map<number, string>();
    const atRisk = analyses.flatMap(({ student, analysis }) => {
      if (!isRiskResult(analysis)) return [];
      analysis.subjectBreakdown.forEach((subject) => {
        if (subject.subjectId !== undefined) subjects.set(subject.subjectId, subject.subject);
      });
      if (requestedLevel && analysis.level !== requestedLevel) return [];
      if (!requestedLevel && analysis.level === "low") return [];
      if (subjectId !== null && !analysis.subjectBreakdown.some((subject) => subject.subjectId === subjectId)) return [];
      return [{
        studentId: student.studentId,
        fullName: student.fullName,
        email: student.email,
        score: analysis.score,
        level: analysis.level,
        topReason: topReason(analysis),
        reasons: analysis.reasons,
        suggestions: analysis.suggestions,
        subjectBreakdown: analysis.subjectBreakdown,
      }];
    }).sort((left, right) => right.score - left.score || left.fullName.localeCompare(right.fullName));

    const { page, limit, offset } = pagination(req.query);
    return res.status(200).json({
      students: atRisk.slice(offset, offset + limit),
      page,
      limit,
      total: atRisk.length,
      subjects: [...subjects.entries()]
        .map(([id, name]) => ({ subjectId: id, subjectName: name }))
        .sort((left, right) => left.subjectName.localeCompare(right.subjectName)),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Could not load at-risk student analysis." });
  }
}
