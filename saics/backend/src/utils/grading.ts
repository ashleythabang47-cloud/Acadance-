/**
 * Compares a student's multiple-choice answer against the correct answer.
 * Case-insensitive and whitespace-tolerant (" b " should still match "B").
 */
export function isMultipleChoiceCorrect(
  studentAnswer: string,
  correctAnswer: string | null
): boolean {
  if (!correctAnswer) return false;
  return studentAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase();
}

/**
 * Turns a raw score/maxScore pair into a rounded percentage.
 * Returns 0 for a zero/invalid maxScore rather than throwing or returning NaN.
 */
export function calculatePercentage(score: number, maxScore: number): number {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100);
}

/**
 * Validates a performance record's score against its max score, matching
 * the rule enforced in performanceController: score must be non-negative,
 * maxScore must be positive, and score can't exceed maxScore.
 */
export function isValidScore(score: number, maxScore: number): boolean {
  if (Number.isNaN(score) || score < 0) return false;
  if (Number.isNaN(maxScore) || maxScore <= 0) return false;
  if (score > maxScore) return false;
  return true;
}
