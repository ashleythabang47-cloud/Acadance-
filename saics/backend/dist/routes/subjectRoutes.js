"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const subjectController_1 = require("../controllers/subjectController");
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.requireAuth, subjectController_1.listSubjects);
router.post("/", authMiddleware_1.requireAuth, subjectController_1.createSubject);
exports.default = router;
