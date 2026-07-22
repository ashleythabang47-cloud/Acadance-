import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Sonnet is used for generation, since question quality benefits from the
// stronger model; Haiku is used for grading, since it's a simpler judgment
// call made far more often (once per open-ended answer submitted).
const GENERATION_MODEL = "claude-sonnet-5";
const GRADING_MODEL = "claude-haiku-4-5-20251001";

export interface GeneratedQuestion {
  question_text: string;
  question_type: "multiple_choice" | "short_answer";
  correct_answer: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
}

function extractJson(text: string): string {
  // Models sometimes wrap JSON in prose or code fences despite instructions —
  // pull out the first [...] block defensively rather than trusting raw output.
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : text;
}

export async function generateQuizQuestions(
  studyText: string,
  difficulty: "easy" | "medium" | "hard",
  numQuestions: number
): Promise<GeneratedQuestion[]> {
  const prompt = `You are helping build a quiz for a university student based on their study material.

Study material:
"""
${studyText}
"""

Generate exactly ${numQuestions} quiz questions at ${difficulty} difficulty, testing understanding of
the key concepts in this material. Use a mix of "multiple_choice" and "short_answer" question types
(roughly 70% multiple_choice, 30% short_answer).

Respond with ONLY a JSON array (no prose, no markdown fences) where each item has this exact shape:

For multiple_choice:
{"question_text": "...", "question_type": "multiple_choice", "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", "correct_answer": "A"}
(correct_answer must be exactly one of "A", "B", "C", or "D")

For short_answer:
{"question_text": "...", "question_type": "short_answer", "correct_answer": "a concise reference answer"}`;

  const response = await anthropic.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI did not return a text response.");
  }

  const jsonText = extractJson(textBlock.text);
  const parsed = JSON.parse(jsonText) as GeneratedQuestion[];
  return parsed;
}

export async function gradeOpenEndedAnswer(
  questionText: string,
  referenceAnswer: string,
  studentAnswer: string
): Promise<{ isCorrect: boolean; feedback: string }> {
  const prompt = `Question: "${questionText}"
Reference answer: "${referenceAnswer}"
Student's answer: "${studentAnswer}"

Judge whether the student's answer demonstrates correct understanding, even if worded
differently from the reference answer. Respond with ONLY JSON, no prose:
{"isCorrect": true or false, "feedback": "one encouraging sentence explaining why, max 25 words"}`;

  const response = await anthropic.messages.create({
    model: GRADING_MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI did not return a text response.");
  }

  const match = textBlock.text.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : textBlock.text;
  return JSON.parse(jsonText) as { isCorrect: boolean; feedback: string };
}
