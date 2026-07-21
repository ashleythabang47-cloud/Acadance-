import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { testConnection } from "./config/db";
import authRoutes from "./routes/authRoutes";
import studentRoutes from "./routes/studentRoutes";
import subjectRoutes from "./routes/subjectRoutes";
import performanceRoutes from "./routes/performanceRoutes";
import streakRoutes from "./routes/streakRoutes";
import studySessionRoutes from "./routes/studySessionRoutes";
import { attachSignaling } from "./sockets/signaling";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

// WebRTC signaling (voice study sessions) rides on the same HTTP server.
attachSignaling(httpServer);

httpServer.listen(PORT, async () => {
  await testConnection();
  console.log(`🚀 SAICS backend running on http://localhost:${PORT}`);
});
