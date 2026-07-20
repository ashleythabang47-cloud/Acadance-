import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { testConnection } from "./config/db";
import authRoutes from "./routes/authRoutes";
import studentRoutes from "./routes/studentRoutes";
import subjectRoutes from "./routes/subjectRoutes";
import performanceRoutes from "./routes/performanceRoutes";
import streakRoutes from "./routes/streakRoutes";

dotenv.config();

const app = express();
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

app.listen(PORT, async () => {
  await testConnection();
  console.log(`🚀 SAICS backend running on http://localhost:${PORT}`);
});
