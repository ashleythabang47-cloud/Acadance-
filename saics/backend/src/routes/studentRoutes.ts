import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { avatarUpload } from "../config/upload";
import {
  getMyProfile,
  updateMyProfile,
  enrollInSubject,
  unenrollFromSubject,
  uploadAvatar,
  removeAvatar,
} from "../controllers/studentController";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.put("/me", requireAuth, updateMyProfile);
router.post("/me/subjects", requireAuth, enrollInSubject);
router.delete("/me/subjects/:subjectId", requireAuth, unenrollFromSubject);
router.post("/me/avatar", requireAuth, avatarUpload.single("avatar"), uploadAvatar);
router.delete("/me/avatar", requireAuth, removeAvatar);

export default router;
