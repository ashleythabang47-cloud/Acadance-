"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const studentModel_1 = require("../models/studentModel");
const streakModel_1 = require("../models/streakModel");
const notificationModel_1 = require("../models/notificationModel");
const streakLogic_1 = require("../utils/streakLogic");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
async function register(req, res) {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "fullName, email and password are required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters." });
        }
        const existing = await studentModel_1.StudentModel.findByEmail(email);
        if (existing) {
            return res.status(409).json({ message: "An account with this email already exists." });
        }
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const studentId = await studentModel_1.StudentModel.create(fullName, email, passwordHash);
        const token = jsonwebtoken_1.default.sign({ studentId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        // Registering counts as day 1 of the streak.
        await streakModel_1.StreakModel.recordActivity(studentId);
        return res.status(201).json({
            message: "Account created successfully.",
            token,
            student: { studentId, fullName, email },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error during registration." });
    }
}
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        const student = await studentModel_1.StudentModel.findByEmail(email);
        if (!student) {
            return res.status(401).json({ message: "Invalid email or password." });
        }
        const isMatch = await bcrypt_1.default.compare(password, student.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password." });
        }
        const token = jsonwebtoken_1.default.sign({ studentId: student.student_id, email: student.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        // Check for a lapsed streak BEFORE today's login counts as new activity —
        // only worth telling someone their streak broke if they actually had
        // one going (a first-ever login shouldn't trigger this).
        const beforeLogin = await streakModel_1.StreakModel.getStreakInfo(student.student_id);
        if (beforeLogin.last_activity_date) {
            const today = (0, streakLogic_1.toDateString)(new Date());
            const gap = (0, streakLogic_1.daysBetween)(beforeLogin.last_activity_date, today);
            if (gap > 1 && beforeLogin.current_streak > 1) {
                await notificationModel_1.NotificationModel.create(student.student_id, `Your ${beforeLogin.current_streak}-day streak reset after a break — no worries, today's a fresh start.`, "reminder");
            }
        }
        // Logging in counts as daily activity for streak purposes.
        await streakModel_1.StreakModel.recordActivity(student.student_id);
        return res.status(200).json({
            message: "Login successful.",
            token,
            student: {
                studentId: student.student_id,
                fullName: student.full_name,
                email: student.email,
                avatarColor: student.avatar_color,
                avatarUrl: student.avatar_url,
            },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error during login." });
    }
}
