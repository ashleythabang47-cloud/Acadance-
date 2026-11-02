import fs from "fs";
import path from "path";
import type {
  CriterionComment,
  GeneratedQuizQuestion,
  LongAnswerGrade,
  MultipleChoiceQuestion,
  QuestionType,
  RubricCriterion,
} from "../grader";
import { displayTerms, splitSentences, stemToken, tokenize } from "./tokenizer";

export const MAX_NOTES_LENGTH = 20000;
export const MAX_ANSWER_LENGTH = 10000;
const MAX_MODEL_ANSWER_LENGTH = 12000;
const MAX_RUBRIC_TEXT_LENGTH = 1000;

export interface LocalEngineWeights {
  keywordCoverage: number;
  tfidfSimilarity: number;
  lengthRatio: number;
}

export interface GradingFeatures {
  keywordCoverage: number;
  tfidfSimilarity: number;
  lengthRatio: number;
}

const WEIGHT_KEYS: (keyof LocalEngineWeights)[] = [
  "keywordCoverage",
  "tfidfSimilarity",
  "lengthRatio",
];

export function loadWeights(): LocalEngineWeights {
  const candidates = [
    path.join(__dirname, "weights.json"),
    path.resolve(__dirname, "../../../src/services/localEngine/weights.json"),
    path.resolve(process.cwd(), "src/services/localEngine/weights.json"),
  ];
  const weightPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!weightPath) throw new Error("Local engine weights.json could not be found.");

  const parsed: unknown = JSON.parse(fs.readFileSync(weightPath, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !WEIGHT_KEYS.every((key) => (
      typeof (parsed as Record<string, unknown>)[key] === "number" &&
      Number.isFinite((parsed as Record<string, number>)[key]) &&
      (parsed as Record<string, number>)[key] >= 0
    ))
  ) {
    throw new Error("Local engine weights.json contains invalid feature weights.");
  }
  const weights = parsed as LocalEngineWeights;
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (total <= 0) throw new Error("Local engine feature weights must have a positive sum.");
  return {
    keywordCoverage: weights.keywordCoverage / total,
    tfidfSimilarity: weights.tfidfSimilarity / total,
    lengthRatio: weights.lengthRatio / total,
  };
}

function termCounts(terms: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

function cosineSimilarity(leftText: string, rightText: string): number {
  const left = termCounts(tokenize(leftText));
  const right = termCounts(tokenize(rightText));
  if (!left.size || !right.size) return 0;

  const vocabulary = new Set([...left.keys(), ...right.keys()]);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const term of vocabulary) {
    const leftFrequency = left.get(term) ?? 0;
    const rightFrequency = right.get(term) ?? 0;
    const documentFrequency = Number(leftFrequency > 0) + Number(rightFrequency > 0);
    const idf = Math.log(3 / (documentFrequency + 1)) + 1;
    const leftWeight = leftFrequency * idf;
    const rightWeight = rightFrequency * idf;
    dot += leftWeight * rightWeight;
    leftMagnitude += leftWeight ** 2;
    rightMagnitude += rightWeight ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))));
}

function criterionTerms(criterion: string, modelAnswer: string): string[] {
  const fromCriterion = [...new Set(tokenize(criterion.slice(0, MAX_RUBRIC_TEXT_LENGTH)))];
  const referenceSentences = splitSentences(modelAnswer.slice(0, MAX_MODEL_ANSWER_LENGTH));
  const relevantSentences = referenceSentences.filter((sentence) =>
    fromCriterion.some((term) => tokenize(sentence).includes(term))
  );
  const referenceTerms = [...new Set(tokenize(
    (relevantSentences.length ? relevantSentences : referenceSentences).join(" ")
  ))]
    .filter((term) => !fromCriterion.includes(term))
    .slice(0, 4);
  return [...new Set([...fromCriterion, ...referenceTerms])];
}

export function extractCriterionFeatures(
  criterion: string,
  modelAnswer: string,
  studentAnswer: string
): GradingFeatures {
  const answer = studentAnswer.slice(0, MAX_ANSWER_LENGTH);
  const reference = modelAnswer.slice(0, MAX_MODEL_ANSWER_LENGTH);
  const targetTerms = criterionTerms(criterion, reference);
  const answerTerms = new Set(tokenize(answer));
  const keywordCoverage = targetTerms.length
    ? targetTerms.filter((term) => answerTerms.has(term)).length / targetTerms.length
    : 0;
  const expectedLength = tokenize(reference).length;
  const actualLength = tokenize(answer).length;

  return {
    keywordCoverage,
    tfidfSimilarity: cosineSimilarity(answer, reference),
    lengthRatio: expectedLength ? Math.min(actualLength / expectedLength, 1) : 0,
  };
}

export function extractGradingFeatures(
  modelAnswer: string,
  rubric: RubricCriterion[],
  studentAnswer: string
): GradingFeatures {
  const maxScore = rubric.reduce((total, item) => total + Math.max(0, item.points), 0);
  if (!maxScore) return { keywordCoverage: 0, tfidfSimilarity: 0, lengthRatio: 0 };
  return rubric.reduce((total, item) => {
    const features = extractCriterionFeatures(item.criterion, modelAnswer, studentAnswer);
    const proportion = Math.max(0, item.points) / maxScore;
    return {
      keywordCoverage: total.keywordCoverage + features.keywordCoverage * proportion,
      tfidfSimilarity: total.tfidfSimilarity + features.tfidfSimilarity * proportion,
      lengthRatio: total.lengthRatio + features.lengthRatio * proportion,
    };
  }, { keywordCoverage: 0, tfidfSimilarity: 0, lengthRatio: 0 });
}

function criterionLabels(criterion: string, modelAnswer: string): string[] {
  const words = displayTerms(criterion.slice(0, MAX_RUBRIC_TEXT_LENGTH));
  const phrases: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]}`);
  }
  phrases.push(...words);
  const labels = [...new Set(phrases)];
  if (!labels.length) return displayTerms(modelAnswer).slice(0, 5);
  return labels;
}

function commentForCriterion(
  criterion: string,
  modelAnswer: string,
  studentAnswer: string
): string {
  const answerTerms = new Set(tokenize(studentAnswer.slice(0, MAX_ANSWER_LENGTH)));
  const labels = criterionLabels(criterion, modelAnswer);
  const covered = labels.filter((label) => {
    const terms = tokenize(label);
    return terms.length > 0 && terms.every((term) => answerTerms.has(term));
  });
  const missing = labels.filter((label) => {
    const terms = tokenize(label);
    return terms.length > 0 && !terms.every((term) => answerTerms.has(term));
  });
  const compact = (items: string[]) => items.slice(0, 3).join(", ");
  const parts: string[] = [];
  if (covered.length) parts.push(`Covers: ${compact(covered)}`);
  if (missing.length) parts.push(`Missing: ${compact(missing)}`);
  return parts.join(". ") || "No key terms identified.";
}

export function gradeLongAnswer(
  question: string,
  modelAnswer: string,
  rubric: RubricCriterion[],
  studentAnswer: string
): LongAnswerGrade {
  const safeAnswer = studentAnswer.slice(0, MAX_ANSWER_LENGTH);
  const safeModelAnswer = modelAnswer.slice(0, MAX_MODEL_ANSWER_LENGTH);
  const weights = loadWeights();
  const criterionComments: CriterionComment[] = rubric.map((item) => {
    const points = Number.isFinite(item.points) && item.points > 0 ? item.points : 0;
    const features = extractCriterionFeatures(item.criterion, safeModelAnswer, safeAnswer);
    const ratio = Math.max(0, Math.min(1,
      features.keywordCoverage * weights.keywordCoverage +
      features.tfidfSimilarity * weights.tfidfSimilarity +
      features.lengthRatio * weights.lengthRatio
    ));
    return {
      criterion: item.criterion,
      points: Math.round(ratio * points * 100) / 100,
      maxPoints: points,
      comment: safeAnswer.trim()
        ? commentForCriterion(item.criterion, safeModelAnswer, safeAnswer)
        : "No answer provided for this criterion.",
    };
  });
  const maxScore = criterionComments.reduce((total, item) => total + item.maxPoints, 0);
  const score = Math.max(0, Math.min(maxScore,
    Math.round(criterionComments.reduce((total, item) => total + item.points, 0) * 100) / 100
  ));

  return {
    score,
    maxScore,
    feedback: safeAnswer.trim()
      ? "Offline assessment based on rubric keywords, answer similarity, and response length."
      : "No answer was provided.",
    criterionComments,
  };
}

interface RankedSentence {
  text: string;
  terms: string[];
  score: number;
}

interface DefinedTerm {
  term: string;
  key: string;
  definition: string;
  section: number;
  sentenceIndex: number;
  score: number;
}

const GENERIC_TOPICS = new Set([
  "code", "development", "requirement", "system", "software", "data",
  "process", "use", "work", "way", "example", "user", "thing", "method",
  "approach", "information", "function", "feature", "application", "program",
  "project", "task", "step", "tool", "type", "part", "area", "need",
]);
const GENERIC_TOPIC_STEMS = new Set([...GENERIC_TOPICS].map((word) => stemToken(word)));

function isGenericTopicWord(word: string): boolean {
  const normalized = word.toLowerCase();
  return GENERIC_TOPICS.has(normalized) || GENERIC_TOPIC_STEMS.has(stemToken(normalized));
}

function rankSentences(notes: string): RankedSentence[] {
  const sentences = splitSentences(notes.slice(0, MAX_NOTES_LENGTH));
  const documents = sentences.map((sentence) => tokenize(sentence));
  const documentFrequency = new Map<string, number>();
  for (const terms of documents) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const count = Math.max(1, documents.length);
  return sentences.map((text, index) => {
    const terms = documents[index];
    const counts = termCounts(terms);
    const score = [...counts].reduce((total, [term, frequency]) => (
      total + frequency * (Math.log((count + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1)
    ), 0) / Math.max(1, terms.length);
    return { text, terms, score };
  }).sort((left, right) => right.score - left.score);
}

function noteSections(notes: string): string[][] {
  return notes
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.replace(/^#{1,6}\s*/gm, "").trim())
    .filter(Boolean)
    .map((block) => splitSentences(block));
}

function cleanDefinedTerm(candidate: string): string | null {
  const term = candidate
    .replace(/^\s*(?:the|a|an)\s+/i, "")
    .replace(/[*_`"'“”‘’]/g, "")
    .trim()
    .replace(/[,;.!?]+$/, "")
    .replace(/\s+/g, " ");
  const words = term.match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/gi) ?? [];
  if (!words.length || words.length > 4) return null;
  if (words.length === 1 && isGenericTopicWord(words[0])) return null;
  return words.join(" ");
}

function parseDefinition(sentence: string): { term: string; definition: string } | null {
  const colon = sentence.match(/^\s*(.{1,100}?)\s*:\s+(.+)$/);
  const copula = sentence.match(
    /^\s*(.{1,100}?)(?:\s*\(([A-Z][A-Z0-9-]{1,11})\))?\s+(is|are|means|describes|refers\s+to)\s+(.+)$/i
  );
  const match = copula ?? colon;
  if (!match) return null;
  const term = cleanDefinedTerm(match[1]);
  const explanation = copula ? match[4] : match[2];
  if (!term || tokenize(explanation).length < 2) return null;
  return { term, definition: sentence.trim() };
}

function definedTerms(notes: string): DefinedTerm[] {
  const sections = noteSections(notes);
  const rankedByText = new Map(
    rankSentences(notes).map((sentence) => [sentence.text.toLowerCase(), sentence.score])
  );
  const result: DefinedTerm[] = [];

  sections.forEach((sentences, section) => {
    sentences.forEach((sentence, sentenceIndex) => {
      const parsed = parseDefinition(sentence);
      if (!parsed) return;
      const key = tokenize(parsed.term).join(" ");
      if (!key || result.some((item) => item.key === key)) return;
      result.push({
        ...parsed,
        key,
        section,
        sentenceIndex,
        score: rankedByText.get(sentence.toLowerCase()) ?? 0,
      });
    });
  });

  const bySection = new Map<number, DefinedTerm[]>();
  for (const item of result) {
    const section = bySection.get(item.section) ?? [];
    section.push(item);
    bySection.set(item.section, section);
  }
  for (const section of bySection.values()) {
    section.sort((left, right) => right.score - left.score);
  }

  const spread: DefinedTerm[] = [];
  while ([...bySection.values()].some((section) => section.length)) {
    for (const section of bySection.values()) {
      const item = section.shift();
      if (item) spread.push(item);
    }
  }
  return spread;
}

function displayTerm(term: string, notes: string): string {
  const words = notes.match(/[a-z0-9]+/gi) ?? [];
  const found = words.find((word) => stemToken(word) === term);
  return found ?? term;
}

function buildMultipleChoice(
  definitions: DefinedTerm[],
  sections: string[][],
  count: number
): MultipleChoiceQuestion[] {
  return definitions.slice(0, count).flatMap((item) => {
    const distractors = definitions
      .filter((other) => other.key !== item.key)
      .slice(0, 3)
      .map((other) => other.term);
    if (distractors.length < 3) return [];
    const sectionSentences = sections[item.section];
    const definitionSentence = sectionSentences[item.sentenceIndex];
    const escapedTerm = item.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blanked = definitionSentence.replace(
      new RegExp(`\\b${escapedTerm}\\b`, "i"),
      "___"
    );
    if (blanked === definitionSentence) return [];
    return {
      question: blanked,
      options: [item.term, ...distractors],
      correctAnswer: item.term,
    };
  });
}

function buildLongAnswer(
  definitions: DefinedTerm[],
  sections: string[][],
  count: number
): GeneratedQuizQuestion[] {
  return definitions.slice(0, count).map((item) => {
    const sectionSentences = sections[item.section];
    const nextDefinitionIndex = sectionSentences.findIndex(
      (sentence, index) => index > item.sentenceIndex && parseDefinition(sentence) !== null
    );
    const sectionEnd = nextDefinitionIndex < 0 ? sectionSentences.length : nextDefinitionIndex;
    const sourceSentences = [
      sectionSentences[item.sentenceIndex],
      ...sectionSentences
        .slice(item.sentenceIndex + 1, sectionEnd)
        .slice(0, 2),
    ];
    const modelAnswer = sourceSentences.join(" ");
    const topicTerms = new Set(tokenize(item.term));
    const keyPoints = [...new Set(displayTerms(modelAnswer)
      .map((word) => stemToken(word))
      .filter((word) =>
        word.length >= 4 &&
        !isGenericTopicWord(word) &&
        !topicTerms.has(word)
      ))]
      .slice(0, 3)
      .map((word) => displayTerm(word, modelAnswer));
    const rubric: RubricCriterion[] = [
      { criterion: `Defines ${item.term}`, points: 2 },
      ...keyPoints.slice(0, 3).map((keyPoint) => ({
        criterion: `Includes ${keyPoint}`,
        points: 1,
      })),
    ];
    if (rubric.length === 1) {
      rubric.push({ criterion: `Explains the purpose of ${item.term}`, points: 1 });
    }
    return {
      question: `Explain ${item.term}. Include its definition and key points from the study notes.`,
      modelAnswer,
      rubric,
    };
  });
}

export function generateQuestions(
  notes: string,
  type: QuestionType,
  count: number
): GeneratedQuizQuestion[] {
  const safeNotes = notes.slice(0, MAX_NOTES_LENGTH);
  const sections = noteSections(safeNotes);
  const definitions = definedTerms(safeNotes);
  if (type === "multiple_choice") return buildMultipleChoice(definitions, sections, count);
  return buildLongAnswer(definitions, sections, count);
}
