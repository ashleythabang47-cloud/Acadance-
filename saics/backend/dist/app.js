"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const studentRoutes_1 = __importDefault(require("./routes/studentRoutes"));
const subjectRoutes_1 = __importDefault(require("./routes/subjectRoutes"));
const performanceRoutes_1 = __importDefault(require("./routes/performanceRoutes"));
const streakRoutes_1 = __importDefault(require("./routes/streakRoutes"));
const studySessionRoutes_1 = __importDefault(require("./routes/studySessionRoutes"));
const quizRoutes_1 = __importDefault(require("./routes/quizRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serves uploaded avatar images (e.g. /uploads/avatars/3-1721234567890.jpg)
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "..", "uploads")));
// Health check
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "SAICS API is running." });
});
app.use("/api/auth", authRoutes_1.default);
app.use("/api/students", studentRoutes_1.default);
app.use("/api/subjects", subjectRoutes_1.default);
app.use("/api/performance", performanceRoutes_1.default);
app.use("/api/streaks", streakRoutes_1.default);
app.use("/api/study-sessions", studySessionRoutes_1.default);
app.use("/api/quizzes", quizRoutes_1.default);
app.use("/api/notifications", notificationRoutes_1.default);
exports.default = app;
