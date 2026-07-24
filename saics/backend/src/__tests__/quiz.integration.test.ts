import request from "supertest";
import app from "../app";
import jwt from "jsonwebtoken";
import { QuizModel } from "../models/quizModel";
import { StreakModel } from "../models/streakModel";
import * as aiService from "../services/aiService";

jest.mock("../models/quizModel");
jest.mock("../models/streakModel");
jest.mock("../services/aiService");

const mockedQuizModel = QuizModel as jest.Mocked<typeof QuizModel>;
const mockedStreakModel = StreakModel as jest.Mocked<typeof StreakModel>;
const mockedAiService = aiService as jest.Mocked<typeof aiService>;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const authToken = jwt.sign({ studentId: 1, email: "test@example.com" }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockedStreakModel.recordActivity.mockResolvedValue({
    current_streak: 1,
    longest_streak: 1,
    last_activity_date: "2026-07-20",
  });
});

describe("POST /api/quizzes/generate", () => {
  it("rejects study material that's too short", async () => {
    const res = await request(app)
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
        question_type: "multiple_choice" as const,
        correct_answer: "A",
        option_a: "Reducing redundancy",
        option_b: "Adding redundancy",
        option_c: "Deleting tables",
        option_d: "None of the above",
      },
    ];
    mockedAiService.generateQuizQuestions.mockResolvedValue(fakeQuestions);
    mockedQuizModel.createQuiz.mockResolvedValue(55);

    const res = await request(app)
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

    const res = await request(app)
      .post("/api/quizzes/55/submit")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ answers: [{ questionId: 1, studentAnswer: "B" }] });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(1);
    expect(res.body.maxScore).toBe(1);
    // Multiple-choice grading is free — the AI grader must not be touched.
    expect(mockedAiService.gradeOpenEndedAnswer).not.toHaveBeenCalled();
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

    const res = await request(app)
      .post("/api/quizzes/55/submit")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ answers: [{ questionId: 2, studentAnswer: "Reduces duplicate data" }] });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(1);
    expect(mockedAiService.gradeOpenEndedAnswer).toHaveBeenCalledTimes(1);
  });
});
