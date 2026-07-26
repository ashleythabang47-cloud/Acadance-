import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { PerformanceModel } from "../models/performanceModel";
import { StreakModel } from "../models/streakModel";
import { NotificationModel } from "../models/notificationModel";
import { SubjectModel } from "../models/subjectModel";

// Below this percentage, a performance record triggers a low-score alert.
const LOW_SCORE_THRESHOLD = 50;

export async function listMyPerformance(req: AuthRequest, res: Response) {
  try {
    const records = await PerformanceModel.findByStudent(req.studentId!);
    return res.status(200).json({ records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching performance records." });
  }
}

export async function createPerformanceRecord(req: AuthRequest, res: Response) {
  try {
    const { subjectId, assessmentName, score, maxScore, assessmentDate } = req.body;

    if (!subjectId || !assessmentName || score === undefined || !assessmentDate) {
      return res.status(400).json({
        message: "subjectId, assessmentName, score and assessmentDate are required.",
      });
    }

    const numericScore = Number(score);
    const numericMaxScore = maxScore !== undefined ? Number(maxScore) : 100;

    if (Number.isNaN(numericScore) || numericScore < 0) {
      return res.status(400).json({ message: "score must be a non-negative number." });
    }
    if (Number.isNaN(numericMaxScore) || numericMaxScore <= 0) {
      return res.status(400).json({ message: "maxScore must be a positive number." });
    }
    if (numericScore > numericMaxScore) {
      return res.status(400).json({ message: "score cannot exceed maxScore." });
    }

    const recordId = await PerformanceModel.create({
      studentId: req.studentId!,
      subjectId: Number(subjectId),
      assessmentName,
      score: numericScore,
      maxScore: numericMaxScore,
      assessmentDate,
    });

    // Logging a result is a countable study activity.
    await StreakModel.recordActivity(req.studentId!);

    // Rules-based recommendation: flag results below the threshold so the
    // student sees it without having to notice the trend themselves.
    const percentage = (numericScore / numericMaxScore) * 100;
    if (percentage < LOW_SCORE_THRESHOLD) {
      const subject = await SubjectModel.findById(Number(subjectId));
      const subjectName = subject?.subject_name || "this subject";
      await NotificationModel.create(
        req.studentId!,
        `Your score on "${assessmentName}" was ${Math.round(percentage)}% — consider reviewing ${subjectName} or generating a practice quiz.`,
        "alert"
      );
    }

    return res.status(201).json({ message: "Record added.", recordId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error creating performance record." });
  }
}

export async function updatePerformanceRecord(req: AuthRequest, res: Response) {
  try {
    const recordId = Number(req.params.id);
    const existing = await PerformanceModel.findOne(recordId, req.studentId!);
    if (!existing) {
      return res.status(404).json({ message: "Record not found." });
    }

    const { subjectId, assessmentName, score, maxScore, assessmentDate } = req.body;

    if (score !== undefined && (Number.isNaN(Number(score)) || Number(score) < 0)) {
      return res.status(400).json({ message: "score must be a non-negative number." });
    }

    const updated = await PerformanceModel.update(recordId, req.studentId!, {
      subjectId: subjectId !== undefined ? Number(subjectId) : undefined,
      assessmentName,
      score: score !== undefined ? Number(score) : undefined,
      maxScore: maxScore !== undefined ? Number(maxScore) : undefined,
      assessmentDate,
    });

    if (!updated) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    return res.status(200).json({ message: "Record updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error updating performance record." });
  }
}

export async function deletePerformanceRecord(req: AuthRequest, res: Response) {
  try {
    const recordId = Number(req.params.id);
    const deleted = await PerformanceModel.delete(recordId, req.studentId!);
    if (!deleted) {
      return res.status(404).json({ message: "Record not found." });
    }
    return res.status(200).json({ message: "Record deleted." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error deleting performance record." });
  }
}
