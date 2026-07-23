import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  listActiveSessions,
  createSession,
  getSession,
  joinSession,
  leaveSession,
  endSession,
  joinByCode,
} from "../controllers/studySessionController";

const router = Router();

router.get("/", requireAuth, listActiveSessions);
router.post("/", requireAuth, createSession);
router.post("/join-by-code", requireAuth, joinByCode);
router.get("/:id", requireAuth, getSession);
router.post("/:id/join", requireAuth, joinSession);
router.post("/:id/leave", requireAuth, leaveSession);
router.post("/:id/end", requireAuth, endSession);

export default router;
