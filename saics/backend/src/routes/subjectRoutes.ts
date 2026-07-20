import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { listSubjects, createSubject } from "../controllers/subjectController";

const router = Router();

router.get("/", requireAuth, listSubjects);
router.post("/", requireAuth, createSubject);

export default router;
