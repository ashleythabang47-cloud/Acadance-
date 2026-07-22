import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  generateQuiz,
  listQuizzes,
  getQuizForTaking,
  submitQuizAttempt,
  getMyQuizHistory,
} from "../controllers/quizController";

const router = Router();

router.post("/generate", requireAuth, generateQuiz);
router.get("/", requireAuth, listQuizzes);
router.get("/history/me", requireAuth, getMyQuizHistory);
router.get("/:id", requireAuth, getQuizForTaking);
router.post("/:id/submit", requireAuth, submitQuizAttempt);

export default router;
