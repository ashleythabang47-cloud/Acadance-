import { Router } from "express";
import { getMyRiskAnalysis } from "../controllers/analyticsController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

router.get("/me", requireAuth, getMyRiskAnalysis);

export default router;
