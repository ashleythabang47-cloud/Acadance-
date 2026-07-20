import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  listMyPerformance,
  createPerformanceRecord,
  updatePerformanceRecord,
  deletePerformanceRecord,
} from "../controllers/performanceController";

const router = Router();

router.get("/", requireAuth, listMyPerformance);
router.post("/", requireAuth, createPerformanceRecord);
router.put("/:id", requireAuth, updatePerformanceRecord);
router.delete("/:id", requireAuth, deletePerformanceRecord);

export default router;
