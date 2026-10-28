"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gradeOpenEndedAnswer = exports.gradeMultipleChoice = exports.gradeLongAnswer = exports.extractJson = void 0;
exports.generateQuizQuestions = generateQuizQuestions;
const grader_1 = require("./grader");
Object.defineProperty(exports, "extractJson", { enumerable: true, get: function () { return grader_1.extractJson; } });
Object.defineProperty(exports, "gradeLongAnswer", { enumerable: true, get: function () { return grader_1.gradeLongAnswer; } });
Object.defineProperty(exports, "gradeMultipleChoice", { enumerable: true, get: function () { return grader_1.gradeMultipleChoice; } });
Object.defineProperty(exports, "gradeOpenEndedAnswer", { enumerable: true, get: function () { return grader_1.gradeOpenEndedAnswer; } });
async function generateQuizQuestions(studyText, difficulty, numQuestions, questionType = "multiple_choice") {
    const generated = await (0, grader_1.generateQuestions)(studyText, questionType, numQuestions, difficulty);
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
        const longAnswer = item;
        return {
            question_text: longAnswer.question,
            question_type: "long_answer",
            correct_answer: longAnswer.modelAnswer,
            model_answer: longAnswer.modelAnswer,
            rubric: longAnswer.rubric,
        };
    });
}
