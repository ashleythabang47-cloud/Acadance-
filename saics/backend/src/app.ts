import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./routes/authRoutes";
import studentRoutes from "./routes/studentRoutes";
import subjectRoutes from "./routes/subjectRoutes";
import performanceRoutes from "./routes/performanceRoutes";
import streakRoutes from "./routes/streakRoutes";
import studySessionRoutes from "./routes/studySessionRoutes";
import quizRoutes from "./routes/quizRoutes";
import notificationRoutes from "./routes/notificationRoutes";

const app = express();

// `origin: true` reflects whatever origin the request came from (rather
// than a hardcoded port), which matters here because the Vite dev server
// picks a different port (5173, 5174, ...) whenever the previous one is
// still occupied. `credentials: true` is required for the browser to
// actually send/receive the httpOnly auth cookie cross-origin.
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Serves uploaded avatar images (e.g. /uploads/avatars/3-1721234567890.jpg)
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "SAICS API is running." });
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/streaks", streakRoutes);
app.use("/api/study-sessions", studySessionRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/notifications", notificationRoutes);

export default app;
