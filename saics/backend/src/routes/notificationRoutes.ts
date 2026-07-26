import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notificationController";

const router = Router();

router.get("/", requireAuth, listMyNotifications);
router.post("/:id/read", requireAuth, markNotificationRead);
router.post("/read-all", requireAuth, markAllNotificationsRead);

export default router;
