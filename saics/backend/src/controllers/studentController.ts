import { Response } from "express";
import path from "path";
import fs from "fs";
import { AuthRequest } from "../middleware/authMiddleware";
import { StudentModel } from "../models/studentModel";
import { SubjectModel } from "../models/subjectModel";
import { UPLOAD_DIR } from "../config/upload";

export async function getMyProfile(req: AuthRequest, res: Response) {
  try {
    const student = await StudentModel.findById(req.studentId!);
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }
    const enrolledSubjects = await SubjectModel.listForStudent(req.studentId!);
    return res.status(200).json({ student, enrolledSubjects });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching profile." });
  }
}

export async function updateMyProfile(req: AuthRequest, res: Response) {
  try {
    const { fullName, bio, academicYear, avatarColor } = req.body;

    if (fullName !== undefined && !fullName.trim()) {
      return res.status(400).json({ message: "fullName cannot be empty." });
    }
    if (bio !== undefined && bio.length > 255) {
      return res.status(400).json({ message: "bio must be 255 characters or fewer." });
    }
    if (avatarColor !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(avatarColor)) {
      return res.status(400).json({ message: "avatarColor must be a valid hex color." });
    }

    const updated = await StudentModel.updateProfile(req.studentId!, {
      fullName,
      bio,
      academicYear,
      avatarColor,
    });

    if (!updated) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    const student = await StudentModel.findById(req.studentId!);
    return res.status(200).json({ message: "Profile updated.", student });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error updating profile." });
  }
}

export async function enrollInSubject(req: AuthRequest, res: Response) {
  try {
    const { subjectId } = req.body;
    if (!subjectId) {
      return res.status(400).json({ message: "subjectId is required." });
    }
    await SubjectModel.enroll(req.studentId!, Number(subjectId));
    return res.status(200).json({ message: "Enrolled." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error enrolling in subject." });
  }
}

export async function unenrollFromSubject(req: AuthRequest, res: Response) {
  try {
    const subjectId = Number(req.params.subjectId);
    await SubjectModel.unenroll(req.studentId!, subjectId);
    return res.status(200).json({ message: "Unenrolled." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error unenrolling from subject." });
  }
}

// Best-effort deletion of an old avatar file — never lets a filesystem
// error interrupt the actual profile update, just logs and moves on.
function deleteAvatarFileIfExists(avatarUrl: string | null) {
  if (!avatarUrl) return;
  const filename = path.basename(avatarUrl);
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete old avatar file:", err);
    }
  });
}

export async function uploadAvatar(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file was uploaded." });
    }

    const existing = await StudentModel.findById(req.studentId!);
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await StudentModel.updateProfile(req.studentId!, { avatarUrl });

    // Clean up the previous file now that the new one is saved and recorded.
    if (existing?.avatar_url) {
      deleteAvatarFileIfExists(existing.avatar_url);
    }

    return res.status(200).json({ message: "Avatar updated.", avatarUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error uploading avatar." });
  }
}

export async function removeAvatar(req: AuthRequest, res: Response) {
  try {
    const existing = await StudentModel.findById(req.studentId!);
    await StudentModel.updateProfile(req.studentId!, { avatarUrl: null });

    if (existing?.avatar_url) {
      deleteAvatarFileIfExists(existing.avatar_url);
    }

    return res.status(200).json({ message: "Avatar removed." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error removing avatar." });
  }
}
