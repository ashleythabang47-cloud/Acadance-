import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { getMyStreak, checkIn } from "../controllers/streakController";

const router = Router();

router.get("/me", requireAuth, getMyStreak);
router.post("/checkin", requireAuth, checkIn);

export default router;
