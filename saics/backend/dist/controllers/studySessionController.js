"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listActiveSessions = listActiveSessions;
exports.createSession = createSession;
exports.joinByCode = joinByCode;
exports.getSession = getSession;
exports.joinSession = joinSession;
exports.leaveSession = leaveSession;
exports.endSession = endSession;
const studySessionModel_1 = require("../models/studySessionModel");
const streakModel_1 = require("../models/streakModel");
async function listActiveSessions(req, res) {
    try {
        const sessions = await studySessionModel_1.StudySessionModel.findActive();
        return res.status(200).json({ sessions });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching study sessions." });
    }
}
async function createSession(req, res) {
    try {
        const { title, subjectId } = req.body;
        if (!title) {
            return res.status(400).json({ message: "title is required." });
        }
        const { sessionId, joinCode } = await studySessionModel_1.StudySessionModel.create(req.studentId, title, subjectId ? Number(subjectId) : null);
        await streakModel_1.StreakModel.recordActivity(req.studentId);
        return res.status(201).json({ message: "Session created.", sessionId, joinCode });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error creating study session." });
    }
}
async function joinByCode(req, res) {
    try {
        const { code } = req.body;
        if (!code || typeof code !== "string") {
            return res.status(400).json({ message: "code is required." });
        }
        const session = await studySessionModel_1.StudySessionModel.findByCode(code);
        if (!session || session.ended_at) {
            return res.status(404).json({ message: "No active session found with that code." });
        }
        await studySessionModel_1.StudySessionModel.join(session.session_id, req.studentId);
        await streakModel_1.StreakModel.recordActivity(req.studentId);
        return res.status(200).json({ message: "Joined session.", sessionId: session.session_id });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error joining session by code." });
    }
}
async function getSession(req, res) {
    try {
        const sessionId = Number(req.params.id);
        const session = await studySessionModel_1.StudySessionModel.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: "Session not found." });
        }
        const participants = await studySessionModel_1.StudySessionModel.getActiveParticipants(sessionId);
        return res.status(200).json({ session, participants });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching session." });
    }
}
async function joinSession(req, res) {
    try {
        const sessionId = Number(req.params.id);
        const session = await studySessionModel_1.StudySessionModel.findById(sessionId);
        if (!session || session.ended_at) {
            return res.status(404).json({ message: "Session not found or has ended." });
        }
        await studySessionModel_1.StudySessionModel.join(sessionId, req.studentId);
        await streakModel_1.StreakModel.recordActivity(req.studentId);
        return res.status(200).json({ message: "Joined session." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error joining session." });
    }
}
async function leaveSession(req, res) {
    try {
        const sessionId = Number(req.params.id);
        await studySessionModel_1.StudySessionModel.leave(sessionId, req.studentId);
        return res.status(200).json({ message: "Left session." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error leaving session." });
    }
}
async function endSession(req, res) {
    try {
        const sessionId = Number(req.params.id);
        const ended = await studySessionModel_1.StudySessionModel.end(sessionId, req.studentId);
        if (!ended) {
            return res.status(403).json({ message: "Only the host can end this session." });
        }
        return res.status(200).json({ message: "Session ended." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error ending session." });
    }
}
