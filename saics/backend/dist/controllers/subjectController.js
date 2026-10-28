"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSubjects = listSubjects;
exports.createSubject = createSubject;
const subjectModel_1 = require("../models/subjectModel");
async function listSubjects(req, res) {
    try {
        const subjects = await subjectModel_1.SubjectModel.findAll();
        return res.status(200).json({ subjects });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching subjects." });
    }
}
async function createSubject(req, res) {
    try {
        const { subjectName, subjectCode } = req.body;
        if (!subjectName || !subjectCode) {
            return res.status(400).json({ message: "subjectName and subjectCode are required." });
        }
        const existing = await subjectModel_1.SubjectModel.findByCode(subjectCode);
        if (existing) {
            return res.status(409).json({ message: "A subject with this code already exists." });
        }
        const subjectId = await subjectModel_1.SubjectModel.create(subjectName, subjectCode);
        return res.status(201).json({ message: "Subject created.", subjectId });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error creating subject." });
    }
}
