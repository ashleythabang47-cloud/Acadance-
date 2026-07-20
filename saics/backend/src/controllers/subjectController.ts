import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { SubjectModel } from "../models/subjectModel";

export async function listSubjects(req: AuthRequest, res: Response) {
  try {
    const subjects = await SubjectModel.findAll();
    return res.status(200).json({ subjects });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching subjects." });
  }
}

export async function createSubject(req: AuthRequest, res: Response) {
  try {
    const { subjectName, subjectCode } = req.body;
    if (!subjectName || !subjectCode) {
      return res.status(400).json({ message: "subjectName and subjectCode are required." });
    }

    const existing = await SubjectModel.findByCode(subjectCode);
    if (existing) {
      return res.status(409).json({ message: "A subject with this code already exists." });
    }

    const subjectId = await SubjectModel.create(subjectName, subjectCode);
    return res.status(201).json({ message: "Subject created.", subjectId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error creating subject." });
  }
}
