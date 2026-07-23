import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { StudySessionModel } from "../models/studySessionModel";
import { StreakModel } from "../models/streakModel";

export async function listActiveSessions(req: AuthRequest, res: Response) {
  try {
    const sessions = await StudySessionModel.findActive();
    return res.status(200).json({ sessions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching study sessions." });
  }
}

export async function createSession(req: AuthRequest, res: Response) {
  try {
    const { title, subjectId } = req.body;
    if (!title) {
      return res.status(400).json({ message: "title is required." });
    }

    const { sessionId, joinCode } = await StudySessionModel.create(
      req.studentId!,
      title,
      subjectId ? Number(subjectId) : null
    );

    await StreakModel.recordActivity(req.studentId!);

    return res.status(201).json({ message: "Session created.", sessionId, joinCode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error creating study session." });
  }
}

export async function joinByCode(req: AuthRequest, res: Response) {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "code is required." });
    }

    const session = await StudySessionModel.findByCode(code);
    if (!session || session.ended_at) {
      return res.status(404).json({ message: "No active session found with that code." });
    }

    await StudySessionModel.join(session.session_id, req.studentId!);
    await StreakModel.recordActivity(req.studentId!);

    return res.status(200).json({ message: "Joined session.", sessionId: session.session_id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error joining session by code." });
  }
}

export async function getSession(req: AuthRequest, res: Response) {
  try {
    const sessionId = Number(req.params.id);
    const session = await StudySessionModel.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }
    const participants = await StudySessionModel.getActiveParticipants(sessionId);
    return res.status(200).json({ session, participants });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching session." });
  }
}

export async function joinSession(req: AuthRequest, res: Response) {
  try {
    const sessionId = Number(req.params.id);
    const session = await StudySessionModel.findById(sessionId);
    if (!session || session.ended_at) {
      return res.status(404).json({ message: "Session not found or has ended." });
    }
    await StudySessionModel.join(sessionId, req.studentId!);
    await StreakModel.recordActivity(req.studentId!);
    return res.status(200).json({ message: "Joined session." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error joining session." });
  }
}

export async function leaveSession(req: AuthRequest, res: Response) {
  try {
    const sessionId = Number(req.params.id);
    await StudySessionModel.leave(sessionId, req.studentId!);
    return res.status(200).json({ message: "Left session." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error leaving session." });
  }
}

export async function endSession(req: AuthRequest, res: Response) {
  try {
    const sessionId = Number(req.params.id);
    const ended = await StudySessionModel.end(sessionId, req.studentId!);
    if (!ended) {
      return res.status(403).json({ message: "Only the host can end this session." });
    }
    return res.status(200).json({ message: "Session ended." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error ending session." });
  }
}
