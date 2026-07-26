import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { QuizModel } from "../models/quizModel";
import { StreakModel } from "../models/streakModel";
import { generateQuizQuestions, gradeOpenEndedAnswer } from "../services/aiService";
import { isMultipleChoiceCorrect } from "../utils/grading";
import { NotificationModel } from "../models/notificationModel";

const LOW_QUIZ_SCORE_THRESHOLD = 50;

export async function generateQuiz(req: AuthRequest, res: Response) {
  try {
    const { subjectId, title, studyText, difficulty, numQuestions } = req.body;

    if (!subjectId || !title || !studyText) {
      return res.status(400).json({ message: "subjectId, title and studyText are required." });
    }
    if (studyText.length < 50) {
      return res.status(400).json({
        message: "studyText is too short to generate a meaningful quiz from (min 50 characters).",
      });
    }

    const validDifficulty = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
    const count = Math.min(Math.max(Number(numQuestions) || 5, 1), 15);

    const questions = await generateQuizQuestions(studyText, validDifficulty, count);

    const quizId = await QuizModel.createQuiz(
      Number(subjectId),
      title,
      validDifficulty,
      req.studentId!,
      questions
    );

    await StreakModel.recordActivity(req.studentId!);

    return res.status(201).json({ message: "Quiz generated.", quizId });
  } catch (err: any) {
    console.error(err);
    if (err.message?.includes("JSON")) {
      return res
        .status(502)
        .json({ message: "The AI response could not be parsed. Please try again." });
    }
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

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: "answers array is required." });
    }

    const questionsWithAnswers = await QuizModel.getQuestionsWithAnswers(quizId);
    const questionMap = new Map(questionsWithAnswers.map((q) => [q.question_id, q]));

    const attemptId = await QuizModel.createAttempt(quizId, req.studentId!);

    let correctCount = 0;
    const results: {
      questionId: number;
      isCorrect: boolean;
      feedback?: string;
      correctAnswer: string | null;
    }[] = [];

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;

      let isCorrect = false;
      let feedback: string | undefined;

      if (question.question_type === "multiple_choice") {
        // Cheap, deterministic, no AI call needed.
        isCorrect = isMultipleChoiceCorrect(answer.studentAnswer, question.correct_answer);
      } else {
        // Open-ended — worth an AI judgment call since exact-match would
        // unfairly mark differently-worded-but-correct answers wrong.
        const graded = await gradeOpenEndedAnswer(
          question.question_text,
          question.correct_answer || "",
          answer.studentAnswer
        );
        isCorrect = graded.isCorrect;
        feedback = graded.feedback;
      }

      if (isCorrect) correctCount++;

      await QuizModel.recordAnswer(attemptId, answer.questionId, answer.studentAnswer, isCorrect);
      results.push({
        questionId: answer.questionId,
        isCorrect,
        feedback,
        correctAnswer: question.correct_answer,
      });
    }

    await QuizModel.completeAttempt(attemptId, correctCount, answers.length);
    await StreakModel.recordActivity(req.studentId!);

    const percentage = (correctCount / answers.length) * 100;
    if (percentage < LOW_QUIZ_SCORE_THRESHOLD) {
      const quiz = await QuizModel.findById(quizId);
      await NotificationModel.create(
        req.studentId!,
        `You scored ${Math.round(percentage)}% on "${quiz?.title || "a recent quiz"}" — want to try another quiz on the same material to reinforce it?`,
        "suggestion"
      );
    }

    return res.status(200).json({
      score: correctCount,
      maxScore: answers.length,
      results,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error grading quiz attempt." });
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
