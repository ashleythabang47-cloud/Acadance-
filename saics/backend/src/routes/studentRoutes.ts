import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getMyProfile,
  updateMyProfile,
  enrollInSubject,
  unenrollFromSubject,
} from "../controllers/studentController";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.put("/me", requireAuth, updateMyProfile);
router.post("/me/subjects", requireAuth, enrollInSubject);
router.delete("/me/subjects/:subjectId", requireAuth, unenrollFromSubject);

export default router;
