"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuiz = generateQuiz;
exports.listQuizzes = listQuizzes;
exports.getQuizForTaking = getQuizForTaking;
exports.submitQuizAttempt = submitQuizAttempt;
exports.getMyQuizHistory = getMyQuizHistory;
const quizModel_1 = require("../models/quizModel");
const streakModel_1 = require("../models/streakModel");
const aiService_1 = require("../services/aiService");
const grader_1 = require("../services/grader");
const notificationModel_1 = require("../models/notificationModel");
const LOW_QUIZ_SCORE_THRESHOLD = 50;
async function generateQuiz(req, res) {
    try {
        const { subjectId, title, studyText, topic, difficulty, numQuestions } = req.body;
        const quizTopic = typeof topic === "string" ? topic : studyText;
        if (!subjectId || !title || typeof quizTopic !== "string" || !quizTopic.trim()) {
            return res.status(400).json({ message: "subjectId, title and topic or studyText are required." });
        }
        if (typeof topic !== "string" && quizTopic.length < 50) {
            return res.status(400).json({
                message: "studyText is too short to generate a meaningful quiz from (min 50 characters).",
            });
        }
        if (typeof topic === "string" && topic.trim().length < 3) {
            return res.status(400).json({ message: "Topic must be at least 3 characters." });
        }
        const validDifficulty = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
        const count = Math.min(Math.max(Number(numQuestions) || 5, 1), 15);
        const questionType = req.body.questionType === "long_answer" ? "long_answer" : "multiple_choice";
        const questions = await (0, aiService_1.generateQuizQuestions)(quizTopic, validDifficulty, count, questionType);
        const quizId = await quizModel_1.QuizModel.createQuiz(Number(subjectId), title, validDifficulty, req.studentId, questions);
        await streakModel_1.StreakModel.recordActivity(req.studentId);
        return res.status(201).json({ message: "Quiz generated.", quizId });
    }
    catch (err) {
        if (err instanceof grader_1.ProviderChainError) {
            return res.status(502).json({
                message: "Question generation is temporarily unavailable. Please try again shortly.",
            });
        }
        console.error(err);
        return res.status(500).json({ message: "Server error generating quiz." });
    }
}
async function listQuizzes(req, res) {
    try {
        const quizzes = await quizModel_1.QuizModel.listAll();
        return res.status(200).json({ quizzes });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching quizzes." });
    }
}
async function getQuizForTaking(req, res) {
    try {
        const quizId = Number(req.params.id);
        const quiz = await quizModel_1.QuizModel.findById(quizId);
        if (!quiz)
            return res.status(404).json({ message: "Quiz not found." });
        const questions = await quizModel_1.QuizModel.getQuestionsForStudent(quizId);
        return res.status(200).json({ quiz, questions });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching quiz." });
    }
}
async function submitQuizAttempt(req, res) {
    try {
        const quizId = Number(req.params.id);
        const { answers } = req.body;
        if (!Array.isArray(answers) ||
            answers.length === 0 ||
            !answers.every((answer) => Number.isInteger(answer?.questionId) && typeof answer.studentAnswer === "string")) {
            return res.status(400).json({ message: "answers array is required." });
        }
        const questionsWithAnswers = await quizModel_1.QuizModel.getQuestionsWithAnswers(quizId);
        const questionMap = new Map(questionsWithAnswers.map((q) => [q.question_id, q]));
        const attemptId = await quizModel_1.QuizModel.createAttempt(quizId, req.studentId);
        let scoreTotal = 0;
        let maxScoreTotal = 0;
        let pendingGrading = false;
        const results = [];
        for (const answer of answers) {
            const question = questionMap.get(answer.questionId);
            if (!question)
                continue;
            let isCorrect = false;
            let score = 0;
            let maxScore = 1;
            let feedback = null;
            let criterionComments = null;
            let gradingStatus = "completed";
            if (question.question_type === "multiple_choice") {
                isCorrect = (0, aiService_1.gradeMultipleChoice)(answer.studentAnswer, question.correct_answer);
                score = isCorrect ? 1 : 0;
            }
            else if (question.question_type === "long_answer") {
                const rubric = parseRubric(question.rubric);
                maxScore = rubric.reduce((total, criterion) => total + criterion.points, 0);
                try {
                    const graded = await (0, aiService_1.gradeLongAnswer)(question.question_text, question.model_answer || question.correct_answer || "", rubric, answer.studentAnswer);
                    score = graded.score;
                    maxScore = graded.maxScore;
                    isCorrect = graded.score === graded.maxScore;
                    feedback = graded.feedback;
                    criterionComments = graded.criterionComments;
                }
                catch {
                    pendingGrading = true;
                    gradingStatus = "pending";
                    isCorrect = null;
                    score = null;
                }
            }
            else {
                try {
                    const graded = await (0, aiService_1.gradeOpenEndedAnswer)(question.question_text, question.correct_answer || "", answer.studentAnswer);
                    isCorrect = graded.isCorrect;
                    score = graded.isCorrect ? 1 : 0;
                    feedback = graded.feedback;
                }
                catch {
                    pendingGrading = true;
                    gradingStatus = "pending";
                    isCorrect = null;
                    score = null;
                }
            }
            if (score !== null)
                scoreTotal += score;
            maxScoreTotal += maxScore;
            await quizModel_1.QuizModel.recordAnswer(attemptId, answer.questionId, answer.studentAnswer, score, maxScore, feedback, criterionComments, gradingStatus, isCorrect);
            results.push({
                questionId: answer.questionId,
                isCorrect,
                score,
                maxScore,
                feedback,
                criterionComments,
                gradingStatus,
                correctAnswer: question.correct_answer,
            });
        }
        await quizModel_1.QuizModel.completeAttempt(attemptId, pendingGrading ? null : scoreTotal, maxScoreTotal, pendingGrading ? "pending" : "completed");
        await streakModel_1.StreakModel.recordActivity(req.studentId);
        const percentage = maxScoreTotal > 0 ? (scoreTotal / maxScoreTotal) * 100 : 0;
        if (!pendingGrading && percentage < LOW_QUIZ_SCORE_THRESHOLD) {
            const quiz = await quizModel_1.QuizModel.findById(quizId);
            await notificationModel_1.NotificationModel.create(req.studentId, `You scored ${Math.round(percentage)}% on "${quiz?.title || "a recent quiz"}" — want to try another quiz on the same material to reinforce it?`, "suggestion");
        }
        return res.status(pendingGrading ? 202 : 200).json({
            score: pendingGrading ? null : scoreTotal,
            maxScore: maxScoreTotal,
            gradingStatus: pendingGrading ? "pending" : "completed",
            message: pendingGrading
                ? "Some answers could not be graded right now. Your attempt is saved as pending grading."
                : undefined,
            results,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error grading quiz attempt." });
    }
    function parseRubric(value) {
        let rubric = value;
        if (typeof rubric === "string") {
            try {
                rubric = JSON.parse(rubric);
            }
            catch {
                rubric = null;
            }
        }
        if (Array.isArray(rubric) &&
            rubric.every((criterion) => criterion &&
                typeof criterion.criterion === "string" &&
                typeof criterion.points === "number" &&
                Number.isFinite(criterion.points) &&
                criterion.points > 0)) {
            return rubric;
        }
        return [{ criterion: "Accuracy", points: 1 }];
    }
}
async function getMyQuizHistory(req, res) {
    try {
        const history = await quizModel_1.QuizModel.getAttemptHistory(req.studentId);
        return res.status(200).json({ history });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching quiz history." });
    }
}
