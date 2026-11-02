import fs from "fs";
import path from "path";
import { RowDataPacket } from "mysql2";
import { pool } from "../config/db";
import {
  extractGradingFeatures,
  GradingFeatures,
  LocalEngineWeights,
} from "../services/localEngine";
import { RubricCriterion } from "../services/grader";

interface TrainingRow extends RowDataPacket {
  student_answer: string | null;
  model_answer: string | null;
  rubric: unknown;
  score: number | string;
  max_score: number | string;
}

interface Example {
  features: GradingFeatures;
  score: number;
}

const featureNames: (keyof GradingFeatures)[] = [
  "keywordCoverage",
  "tfidfSimilarity",
  "lengthRatio",
];

function parseRubric(value: unknown): RubricCriterion[] | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.length ||
    !parsed.every((item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.criterion === "string" &&
      typeof item.points === "number" &&
      Number.isFinite(item.points) &&
      item.points > 0
    )
  ) {
    return null;
  }
  return parsed as RubricCriterion[];
}

function solveRidge(examples: Example[]): LocalEngineWeights {
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const example of examples) {
    const values = featureNames.map((name) => example.features[name]);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        matrix[row][column] += values[row] * values[column];
      }
      matrix[row][3] += values[row] * example.score;
    }
  }
  for (let index = 0; index < 3; index += 1) matrix[index][index] += 0.1;

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    }
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    const divisor = matrix[pivot][pivot];
    if (Math.abs(divisor) < 1e-10) throw new Error("Training feature matrix is singular.");
    for (let column = pivot; column < 4; column += 1) matrix[pivot][column] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let column = pivot; column < 4; column += 1) {
        matrix[row][column] -= factor * matrix[pivot][column];
      }
    }
  }

  const positive = matrix.map((row) => Math.max(0, row[3]));
  const sum = positive.reduce((total, coefficient) => total + coefficient, 0);
  if (!sum) throw new Error("Training did not produce positive feature weights.");
  return {
    keywordCoverage: positive[0] / sum,
    tfidfSimilarity: positive[1] / sum,
    lengthRatio: positive[2] / sum,
  };
}

function predict(features: GradingFeatures, weights: LocalEngineWeights): number {
  return Math.max(0, Math.min(1,
    featureNames.reduce((total, name) => total + features[name] * weights[name], 0)
  ));
}

function splitExamples(examples: Example[]): { train: Example[]; test: Example[] } {
  const shuffled = [...examples];
  let seed = 42;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const swap = seed % (index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const testSize = Math.max(1, Math.floor(shuffled.length * 0.2));
  return {
    test: shuffled.slice(0, testSize),
    train: shuffled.slice(testSize),
  };
}

async function trainLocalEngine() {
  try {
    const [rows] = await pool.query<TrainingRow[]>(
      `SELECT aa.student_answer, q.model_answer, q.rubric, aa.score, aa.max_score
       FROM quiz_attempt_answers aa
       JOIN quiz_questions q ON q.question_id = aa.question_id
       WHERE aa.grading_status = 'completed'
         AND q.question_type = 'long_answer'
         AND aa.score IS NOT NULL AND aa.max_score > 0
         AND (aa.grading_source IS NULL OR aa.grading_source = 'ai-provider')`
    );
    const examples = rows.flatMap((row): Example[] => {
      const rubric = parseRubric(row.rubric);
      const score = Number(row.score);
      const maxScore = Number(row.max_score);
      if (!rubric || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
        return [];
      }
      return [{
        features: extractGradingFeatures(
          row.model_answer ?? "",
          rubric,
          row.student_answer ?? ""
        ),
        score: Math.max(0, Math.min(1, score / maxScore)),
      }];
    });

    if (examples.length < 30) {
      console.log(
        `Found ${examples.length} valid AI-graded long answers; at least 30 are required. ` +
        "Keeping the default weights unchanged."
      );
      return;
    }

    const { train, test } = splitExamples(examples);
    const weights = solveRidge(train);
    const mae = test.reduce((total, example) => (
      total + Math.abs(predict(example.features, weights) - example.score)
    ), 0) / test.length;
    const weightsPath = path.resolve(process.cwd(), "src/services/localEngine/weights.json");
    fs.writeFileSync(weightsPath, `${JSON.stringify(weights, null, 2)}\n`, "utf8");
    console.log(
      `Trained local-engine weights from ${train.length} rows; held-out 20% MAE: ${mae.toFixed(4)}.`
    );
  } catch (error) {
    console.error("Local engine training failed.", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void trainLocalEngine();
