import express from "express";
import cors from "cors";
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

app.use(cors());
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
