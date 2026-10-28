import {
  extractJson,
  generateQuestions,
  gradeLongAnswer,
  gradeMultipleChoice,
  gradeOpenEndedAnswer,
  LongAnswerQuestion,
  MultipleChoiceQuestion,
  QuestionType,
  RubricCriterion,
} from "./grader";

export interface GeneratedQuestion {
  question_text: string;
  question_type: "multiple_choice" | "short_answer" | "long_answer";
  correct_answer: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  model_answer?: string;
  rubric?: RubricCriterion[];
}

export { extractJson, gradeLongAnswer, gradeMultipleChoice, gradeOpenEndedAnswer };

export async function generateQuizQuestions(
  studyText: string,
  difficulty: "easy" | "medium" | "hard",
  numQuestions: number,
  questionType: QuestionType = "multiple_choice"
): Promise<GeneratedQuestion[]> {
  const generated = await generateQuestions(studyText, questionType, numQuestions, difficulty);

  return generated.map((item) => {
    if ("options" in item) {
      const correctIndex = item.options.indexOf(item.correctAnswer);
      return {
        question_text: item.question,
        question_type: "multiple_choice",
        correct_answer: String.fromCharCode(65 + correctIndex),
        option_a: item.options[0],
        option_b: item.options[1],
        option_c: item.options[2],
        option_d: item.options[3],
      };
    }

    const longAnswer = item as LongAnswerQuestion;
    return {
      question_text: longAnswer.question,
      question_type: "long_answer",
      correct_answer: longAnswer.modelAnswer,
      model_answer: longAnswer.modelAnswer,
      rubric: longAnswer.rubric,
    };
  });
}
