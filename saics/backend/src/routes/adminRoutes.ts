import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware";
import { adminActionRateLimit } from "../middleware/adminActionRateLimit";
import { downloadBackup, getBackups, postBackup } from "../controllers/backupController";
import { listAtRiskStudents } from "../controllers/analyticsController";
import { generateAdminReport } from "../controllers/adminReportsController";
import {
  createUser,
  resetUserPassword,
  updateOwnCredentials,
  deleteQuestionContent,
  deleteQuizContent,
  getAiMonitoring,
  getDashboard,
  getSystemHealth,
  getUser,
  listAuditLogs,
  listAdminAnnouncements,
  listContent,
  listUsers,
  postAnnouncement,
  resolveContentFlag,
  retryPendingGrade,
  updateQuestionContent,
  updateQuizContent,
  updateUser,
} from "../controllers/adminController";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/dashboard", getDashboard);
router.get("/analytics/at-risk", listAtRiskStudents);
router.get("/reports/:type", generateAdminReport);
router.get("/users", listUsers);
router.post("/me/credentials", adminActionRateLimit, updateOwnCredentials);
router.post("/users", adminActionRateLimit, createUser);
router.get("/users/:id", getUser);
router.post("/users/:id/reset-password", adminActionRateLimit, resetUserPassword);
router.patch("/users/:id", adminActionRateLimit, updateUser);
router.get("/audit", listAuditLogs);
router.get("/content", listContent);
router.patch("/content/quizzes/:id", updateQuizContent);
router.delete("/content/quizzes/:id", deleteQuizContent);
router.patch("/content/questions/:id", updateQuestionContent);
router.delete("/content/questions/:id", deleteQuestionContent);
router.patch("/content/flags/:id/resolve", resolveContentFlag);
router.get("/ai/monitoring", getAiMonitoring);
router.get("/ai/pending", getAiMonitoring);
router.post("/ai/pending/:id/retry", retryPendingGrade);
router.get("/system", getSystemHealth);
router.get("/backups", adminActionRateLimit, getBackups);
router.post("/backups", adminActionRateLimit, postBackup);
router.get("/backups/:name/download", adminActionRateLimit, downloadBackup);
router.get("/announcements", listAdminAnnouncements);
router.post("/announcements", postAnnouncement);

export default router;
