import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/authMiddleware";
import { StudentModel } from "../models/studentModel";

const router = Router();

// GET /api/students/me - returns the logged-in student's profile
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const student = await StudentModel.findById(req.studentId!);
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }
    return res.status(200).json({ student });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
