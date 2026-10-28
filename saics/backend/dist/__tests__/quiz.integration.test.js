"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const quizModel_1 = require("../models/quizModel");
const streakModel_1 = require("../models/streakModel");
const notificationModel_1 = require("../models/notificationModel");
const aiService = __importStar(require("../services/aiService"));
const grader_1 = require("../services/grader");
jest.mock("../models/quizModel");
jest.mock("../models/streakModel");
jest.mock("../models/notificationModel");
jest.mock("../services/aiService");
const mockedQuizModel = quizModel_1.QuizModel;
const mockedStreakModel = streakModel_1.StreakModel;
const mockedNotificationModel = notificationModel_1.NotificationModel;
const mockedAiService = aiService;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const authToken = jsonwebtoken_1.default.sign({ studentId: 1, email: "test@example.com" }, JWT_SECRET);
beforeEach(() => {
    jest.clearAllMocks();
    mockedStreakModel.recordActivity.mockResolvedValue({
        current_streak: 1,
        longest_streak: 1,
        last_activity_date: "2026-07-20",
    });
    mockedAiService.gradeMultipleChoice.mockImplementation((studentAnswer, correctAnswer) => Boolean(correctAnswer &&
        studentAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase()));
});
describe("POST /api/quizzes/generate", () => {
    it("rejects study material that's too short", async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/generate")
            .set("Authorization", `Bearer ${authToken}`)
            .send({ subjectId: 1, title: "Quiz", studyText: "too short" });
        expect(res.status).toBe(400);
        // Confirms we don't waste an API call on input we already know is invalid.
        expect(mockedAiService.generateQuizQuestions).not.toHaveBeenCalled();
    });
    it("generates a quiz from valid study material without calling the real API", async () => {
        const fakeQuestions = [
            {
                question_text: "What is normalization?",
                question_type: "multiple_choice",
                correct_answer: "A",
                option_a: "Reducing redundancy",
                option_b: "Adding redundancy",
                option_c: "Deleting tables",
                option_d: "None of the above",
            },
        ];
        mockedAiService.generateQuizQuestions.mockResolvedValue(fakeQuestions);
        mockedQuizModel.createQuiz.mockResolvedValue(55);
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/generate")
            .set("Authorization", `Bearer ${authToken}`)
            .send({
            subjectId: 1,
            title: "Databases Quiz",
            studyText: "Normalization is the process of organizing data to reduce redundancy.",
            difficulty: "medium",
            numQuestions: 1,
        });
        expect(res.status).toBe(201);
        expect(res.body.quizId).toBe(55);
        expect(mockedAiService.generateQuizQuestions).toHaveBeenCalledTimes(1);
    });
    it("reports provider outages as a temporary generation error", async () => {
        mockedAiService.generateQuizQuestions.mockRejectedValue(new grader_1.ProviderChainError());
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/generate")
            .set("Authorization", `Bearer ${authToken}`)
            .send({
            subjectId: 1,
            title: "Databases Quiz",
            studyText: "Normalization is the process of organizing data to reduce redundancy.",
            numQuestions: 1,
        });
        expect(res.status).toBe(502);
        expect(res.body.message).toMatch(/temporarily unavailable/i);
        expect(mockedQuizModel.createQuiz).not.toHaveBeenCalled();
    });
});
describe("POST /api/quizzes/:id/submit", () => {
    it("grades multiple-choice answers without calling the AI grader", async () => {
        mockedQuizModel.getQuestionsWithAnswers.mockResolvedValue([
            {
                question_id: 1,
                quiz_id: 55,
                question_text: "2+2?",
                question_type: "multiple_choice",
                correct_answer: "B",
                option_a: "3",
                option_b: "4",
                option_c: "5",
                option_d: "6",
            },
        ]);
        mockedQuizModel.createAttempt.mockResolvedValue(200);
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/55/submit")
            .set("Authorization", `Bearer ${authToken}`)
            .send({ answers: [{ questionId: 1, studentAnswer: "B" }] });
        expect(res.status).toBe(200);
        expect(res.body.score).toBe(1);
        expect(res.body.maxScore).toBe(1);
        // Multiple-choice grading is deterministic and does not use a provider.
        expect(mockedAiService.gradeOpenEndedAnswer).not.toHaveBeenCalled();
        expect(mockedAiService.gradeLongAnswer).not.toHaveBeenCalled();
    });
    it("calls the AI grader only for short-answer questions", async () => {
        mockedQuizModel.getQuestionsWithAnswers.mockResolvedValue([
            {
                question_id: 2,
                quiz_id: 55,
                question_text: "Explain normalization.",
                question_type: "short_answer",
                correct_answer: "Organizing data to reduce redundancy",
                option_a: null,
                option_b: null,
                option_c: null,
                option_d: null,
            },
        ]);
        mockedQuizModel.createAttempt.mockResolvedValue(201);
        mockedAiService.gradeOpenEndedAnswer.mockResolvedValue({
            isCorrect: true,
            feedback: "Good understanding shown.",
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/55/submit")
            .set("Authorization", `Bearer ${authToken}`)
            .send({ answers: [{ questionId: 2, studentAnswer: "Reduces duplicate data" }] });
        expect(res.status).toBe(200);
        expect(res.body.score).toBe(1);
        expect(mockedAiService.gradeOpenEndedAnswer).toHaveBeenCalledTimes(1);
    });
    it("saves provider failures as pending grading rather than a zero", async () => {
        mockedQuizModel.getQuestionsWithAnswers.mockResolvedValue([
            {
                question_id: 5,
                quiz_id: 55,
                question_text: "Explain photosynthesis.",
                question_type: "long_answer",
                correct_answer: "Plants convert light energy into chemical energy.",
                model_answer: "Plants convert light energy into chemical energy.",
                rubric: [{ criterion: "Energy conversion", points: 2 }],
                option_a: null,
                option_b: null,
                option_c: null,
                option_d: null,
            },
        ]);
        mockedQuizModel.createAttempt.mockResolvedValue(204);
        mockedAiService.gradeLongAnswer.mockRejectedValue(new Error("providers unavailable"));
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/55/submit")
            .set("Authorization", `Bearer ${authToken}`)
            .send({ answers: [{ questionId: 5, studentAnswer: "A thoughtful answer." }] });
        expect(res.status).toBe(202);
        expect(res.body.gradingStatus).toBe("pending");
        expect(res.body.score).toBeNull();
        expect(res.body.results[0].score).toBeNull();
        expect(res.body.message).toMatch(/pending grading/i);
        expect(mockedQuizModel.recordAnswer).toHaveBeenCalledWith(204, 5, "A thoughtful answer.", null, 2, null, null, "pending", null);
        expect(mockedQuizModel.completeAttempt).toHaveBeenCalledWith(204, null, 2, "pending");
    });
    it("does NOT create a notification for a passing quiz score", async () => {
        mockedQuizModel.getQuestionsWithAnswers.mockResolvedValue([
            {
                question_id: 3,
                quiz_id: 55,
                question_text: "2+2?",
                question_type: "multiple_choice",
                correct_answer: "B",
                option_a: "3",
                option_b: "4",
                option_c: "5",
                option_d: "6",
            },
        ]);
        mockedQuizModel.createAttempt.mockResolvedValue(202);
        await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/55/submit")
            .set("Authorization", `Bearer ${authToken}`)
            .send({ answers: [{ questionId: 3, studentAnswer: "B" }] });
        expect(mockedNotificationModel.create).not.toHaveBeenCalled();
    });
    it("creates a suggestion notification when the quiz score is below the threshold", async () => {
        mockedQuizModel.getQuestionsWithAnswers.mockResolvedValue([
            {
                question_id: 4,
                quiz_id: 55,
                question_text: "2+2?",
                question_type: "multiple_choice",
                correct_answer: "B",
                option_a: "3",
                option_b: "4",
                option_c: "5",
                option_d: "6",
            },
        ]);
        mockedQuizModel.createAttempt.mockResolvedValue(203);
        mockedQuizModel.findById.mockResolvedValue({
            quiz_id: 55,
            subject_id: 1,
            title: "Databases Quiz",
            difficulty: "medium",
            created_by: 1,
            created_at: "2026-07-20",
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .post("/api/quizzes/55/submit")
            .set("Authorization", `Bearer ${authToken}`)
            // Wrong answer on the only question — 0% score, below the 50% threshold.
            .send({ answers: [{ questionId: 4, studentAnswer: "A" }] });
        expect(res.status).toBe(200);
        expect(mockedNotificationModel.create).toHaveBeenCalledTimes(1);
        const [studentId, message, type] = mockedNotificationModel.create.mock.calls[0];
        expect(studentId).toBe(1);
        expect(message).toContain("Databases Quiz");
        expect(type).toBe("suggestion");
    });
});
