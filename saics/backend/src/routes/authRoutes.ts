import { Router } from "express";
import { changePassword, register, login } from "../controllers/authController";
import { resendOtp, verifyOtp } from "../controllers/emailVerificationController";
import { requireAuth } from "../middleware/authMiddleware";
import { loginRateLimit } from "../middleware/loginRateLimit";

const router = Router();

router.post("/register", register);
router.post("/login", loginRateLimit, login);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/change-password", requireAuth, changePassword);

export default router;
