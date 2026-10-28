import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { QuizModel, QuizQuestion } from "../models/quizModel";
import { StreakModel } from "../models/streakModel";
import {
  generateQuizQuestions,
  gradeLongAnswer,
  gradeMultipleChoice,
  gradeOpenEndedAnswer,
} from "../services/aiService";
import {
  CriterionComment,
  ProviderChainError,
  QuestionType,
  RubricCriterion,
} from "../services/grader";
import { NotificationModel } from "../models/notificationModel";

const LOW_QUIZ_SCORE_THRESHOLD = 50;

export async function generateQuiz(req: AuthRequest, res: Response) {
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
    const questionType: QuestionType =
      req.body.questionType === "long_answer" ? "long_answer" : "multiple_choice";

    const questions = await generateQuizQuestions(
      quizTopic,
      validDifficulty,
      count,
      questionType
    );

    const quizId = await QuizModel.createQuiz(
      Number(subjectId),
      title,
      validDifficulty,
      req.studentId!,
      questions
    );

    await StreakModel.recordActivity(req.studentId!);

    return res.status(201).json({ message: "Quiz generated.", quizId });
  } catch (err) {
    if (err instanceof ProviderChainError) {
      return res.status(502).json({
        message: "Question generation is temporarily unavailable. Please try again shortly.",
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error generating quiz." });
  }
}

export async function listQuizzes(req: AuthRequest, res: Response) {
  try {
    const quizzes = await QuizModel.listAll();
    return res.status(200).json({ quizzes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching quizzes." });
  }
}

export async function getQuizForTaking(req: AuthRequest, res: Response) {
  try {
    const quizId = Number(req.params.id);
    const quiz = await QuizModel.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const questions = await QuizModel.getQuestionsForStudent(quizId);
    return res.status(200).json({ quiz, questions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching quiz." });
  }
}

export async function submitQuizAttempt(req: AuthRequest, res: Response) {
  try {
    const quizId = Number(req.params.id);
    const { answers } = req.body as {
      answers: { questionId: number; studentAnswer: string }[];
    };

    if (
      !Array.isArray(answers) ||
      answers.length === 0 ||
      !answers.every(
        (answer) =>
          Number.isInteger(answer?.questionId) && typeof answer.studentAnswer === "string"
      )
    ) {
      return res.status(400).json({ message: "answers array is required." });
    }

    const questionsWithAnswers = await QuizModel.getQuestionsWithAnswers(quizId);
    const questionMap = new Map(questionsWithAnswers.map((q) => [q.question_id, q]));

    const attemptId = await QuizModel.createAttempt(quizId, req.studentId!);

    let scoreTotal = 0;
    let maxScoreTotal = 0;
    let pendingGrading = false;
    const results: {
      questionId: number;
      isCorrect: boolean | null;
      score: number | null;
      maxScore: number;
      feedback: string | null;
      criterionComments: CriterionComment[] | null;
      gradingStatus: "pending" | "completed";
      correctAnswer: string | null;
    }[] = [];

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;

      let isCorrect: boolean | null = false;
      let score: number | null = 0;
      let maxScore = 1;
      let feedback: string | null = null;
      let criterionComments: CriterionComment[] | null = null;
      let gradingStatus: "pending" | "completed" = "completed";

      if (question.question_type === "multiple_choice") {
        isCorrect = gradeMultipleChoice(answer.studentAnswer, question.correct_answer);
        score = isCorrect ? 1 : 0;
      } else if (question.question_type === "long_answer") {
        const rubric = parseRubric(question.rubric);
        maxScore = rubric.reduce((total, criterion) => total + criterion.points, 0);
        try {
          const graded = await gradeLongAnswer(
            question.question_text,
            question.model_answer || question.correct_answer || "",
            rubric,
            answer.studentAnswer
          );
          score = graded.score;
          maxScore = graded.maxScore;
          isCorrect = graded.score === graded.maxScore;
          feedback = graded.feedback;
          criterionComments = graded.criterionComments;
        } catch {
          pendingGrading = true;
          gradingStatus = "pending";
          isCorrect = null;
          score = null;
        }
      } else {
        try {
          const graded = await gradeOpenEndedAnswer(
            question.question_text,
            question.correct_answer || "",
            answer.studentAnswer
          );
          isCorrect = graded.isCorrect;
          score = graded.isCorrect ? 1 : 0;
          feedback = graded.feedback;
        } catch {
          pendingGrading = true;
          gradingStatus = "pending";
          isCorrect = null;
          score = null;
        }
      }

      if (score !== null) scoreTotal += score;
      maxScoreTotal += maxScore;
      await QuizModel.recordAnswer(
        attemptId,
        answer.questionId,
        answer.studentAnswer,
        score,
        maxScore,
        feedback,
        criterionComments,
        gradingStatus,
        isCorrect
      );
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

    await QuizModel.completeAttempt(
      attemptId,
      pendingGrading ? null : scoreTotal,
      maxScoreTotal,
      pendingGrading ? "pending" : "completed"
    );
    await StreakModel.recordActivity(req.studentId!);

    const percentage = maxScoreTotal > 0 ? (scoreTotal / maxScoreTotal) * 100 : 0;
    if (!pendingGrading && percentage < LOW_QUIZ_SCORE_THRESHOLD) {
      const quiz = await QuizModel.findById(quizId);
      await NotificationModel.create(
        req.studentId!,
        `You scored ${Math.round(percentage)}% on "${quiz?.title || "a recent quiz"}" — want to try another quiz on the same material to reinforce it?`,
        "suggestion"
      );
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error grading quiz attempt." });
  }

  function parseRubric(value: QuizQuestion["rubric"]): RubricCriterion[] {
    let rubric: unknown = value;
    if (typeof rubric === "string") {
      try {
        rubric = JSON.parse(rubric);
      } catch {
        rubric = null;
      }
    }
    if (
      Array.isArray(rubric) &&
      rubric.every(
        (criterion) =>
          criterion &&
          typeof criterion.criterion === "string" &&
          typeof criterion.points === "number" &&
          Number.isFinite(criterion.points) &&
          criterion.points > 0
      )
    ) {
      return rubric;
    }
    return [{ criterion: "Accuracy", points: 1 }];
  }
}

export async function getMyQuizHistory(req: AuthRequest, res: Response) {
  try {
    const history = await QuizModel.getAttemptHistory(req.studentId!);
    return res.status(200).json({ history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error fetching quiz history." });
  }
}
