"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const streakController_1 = require("../controllers/streakController");
const router = (0, express_1.Router)();
router.get("/me", authMiddleware_1.requireAuth, streakController_1.getMyStreak);
router.post("/checkin", authMiddleware_1.requireAuth, streakController_1.checkIn);
exports.default = router;
