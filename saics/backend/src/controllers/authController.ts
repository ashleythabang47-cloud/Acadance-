import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { StudentModel } from "../models/studentModel";
import { StreakModel } from "../models/streakModel";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export async function register(req: Request, res: Response) {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "fullName, email and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const existing = await StudentModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const studentId = await StudentModel.create(fullName, email, passwordHash);

    const token = jwt.sign({ studentId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    // Registering counts as day 1 of the streak.
    await StreakModel.recordActivity(studentId);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      student: { studentId, fullName, email },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error during registration." });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const student = await StudentModel.findByEmail(email);
    if (!student) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, student.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { studentId: student.student_id, email: student.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Logging in counts as daily activity for streak purposes.
    await StreakModel.recordActivity(student.student_id);

    return res.status(200).json({
      message: "Login successful.",
      token,
      student: {
        studentId: student.student_id,
        fullName: student.full_name,
        email: student.email,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error during login." });
  }
}
