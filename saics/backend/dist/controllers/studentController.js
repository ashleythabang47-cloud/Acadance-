"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyProfile = getMyProfile;
exports.updateMyProfile = updateMyProfile;
exports.enrollInSubject = enrollInSubject;
exports.unenrollFromSubject = unenrollFromSubject;
exports.uploadAvatar = uploadAvatar;
exports.removeAvatar = removeAvatar;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const studentModel_1 = require("../models/studentModel");
const subjectModel_1 = require("../models/subjectModel");
const upload_1 = require("../config/upload");
async function getMyProfile(req, res) {
    try {
        const student = await studentModel_1.StudentModel.findById(req.studentId);
        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }
        const enrolledSubjects = await subjectModel_1.SubjectModel.listForStudent(req.studentId);
        return res.status(200).json({ student, enrolledSubjects });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching profile." });
    }
}
async function updateMyProfile(req, res) {
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
        const updated = await studentModel_1.StudentModel.updateProfile(req.studentId, {
            fullName,
            bio,
            academicYear,
            avatarColor,
        });
        if (!updated) {
            return res.status(400).json({ message: "No valid fields to update." });
        }
        const student = await studentModel_1.StudentModel.findById(req.studentId);
        return res.status(200).json({ message: "Profile updated.", student });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error updating profile." });
    }
}
async function enrollInSubject(req, res) {
    try {
        const { subjectId } = req.body;
        if (!subjectId) {
            return res.status(400).json({ message: "subjectId is required." });
        }
        await subjectModel_1.SubjectModel.enroll(req.studentId, Number(subjectId));
        return res.status(200).json({ message: "Enrolled." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error enrolling in subject." });
    }
}
async function unenrollFromSubject(req, res) {
    try {
        const subjectId = Number(req.params.subjectId);
        await subjectModel_1.SubjectModel.unenroll(req.studentId, subjectId);
        return res.status(200).json({ message: "Unenrolled." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error unenrolling from subject." });
    }
}
// Best-effort deletion of an old avatar file — never lets a filesystem
// error interrupt the actual profile update, just logs and moves on.
function deleteAvatarFileIfExists(avatarUrl) {
    if (!avatarUrl)
        return;
    const filename = path_1.default.basename(avatarUrl);
    const filePath = path_1.default.join(upload_1.UPLOAD_DIR, filename);
    fs_1.default.unlink(filePath, (err) => {
        if (err && err.code !== "ENOENT") {
            console.error("Failed to delete old avatar file:", err);
        }
    });
}
async function uploadAvatar(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No image file was uploaded." });
        }
        const existing = await studentModel_1.StudentModel.findById(req.studentId);
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        await studentModel_1.StudentModel.updateProfile(req.studentId, { avatarUrl });
        // Clean up the previous file now that the new one is saved and recorded.
        if (existing?.avatar_url) {
            deleteAvatarFileIfExists(existing.avatar_url);
        }
        return res.status(200).json({ message: "Avatar updated.", avatarUrl });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error uploading avatar." });
    }
}
async function removeAvatar(req, res) {
    try {
        const existing = await studentModel_1.StudentModel.findById(req.studentId);
        await studentModel_1.StudentModel.updateProfile(req.studentId, { avatarUrl: null });
        if (existing?.avatar_url) {
            deleteAvatarFileIfExists(existing.avatar_url);
        }
        return res.status(200).json({ message: "Avatar removed." });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error removing avatar." });
    }
}
