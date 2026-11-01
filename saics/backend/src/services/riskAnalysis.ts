export type RiskLevel = "low" | "medium" | "high";
export type RiskAnalysisLevel = RiskLevel | "insufficient_data";

export interface RiskPerformanceRecord {
  score: number;
  max_score: number;
  date: string | Date;
  subject: string;
  subjectId?: number;
  quizAttemptId?: number | null;
}

export interface RiskQuizAttempt {
  score: number;
  max_score: number;
  attemptId?: number;
}

export interface RiskAnalysisInput {
  performanceRecords: RiskPerformanceRecord[];
  quizAttemptScores: RiskQuizAttempt[];
  lastActivityDate: string | Date | null;
  currentStreak: number;
  asOfDate?: string | Date;
}

export interface SubjectRiskBreakdown {
  subjectId?: number;
  subject: string;
  averageScore: number;
  recordCount: number;
  reasons: string[];
}

export interface RiskAnalysisResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
  suggestions: string[];
  subjectBreakdown: SubjectRiskBreakdown[];
  signals: {
    recentAverage: number;
    trendDecline: number;
    inactivityDays: number | null;
    quizAverage: number | null;
  };
}

export interface InsufficientRiskAnalysis {
  level: "insufficient_data";
}

function percentage(score: number, maxScore: number): number {
  return maxScore > 0 ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function regressionSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const meanX = (values.length - 1) / 2;
  const meanY = average(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator ? numerator / denominator : 0;
}

function dateValue(value: string | Date): number {
  const dateString = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const [year, month, day] = dateString.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function riskLevel(score: number): RiskLevel {
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export function calculateRisk(input: RiskAnalysisInput): RiskAnalysisResult | InsufficientRiskAnalysis {
  const records = input.performanceRecords
    .filter((record) => Number.isFinite(record.score) && Number.isFinite(record.max_score) && record.max_score > 0)
    .map((record) => ({ ...record, percentage: percentage(record.score, record.max_score) }))
    .sort((left, right) => dateValue(left.date) - dateValue(right.date));
  if (records.length < 3) return { level: "insufficient_data" };

  const percentages = records.map((record) => record.percentage);
  const recent = records.slice(-3);
  const recentAverage = average(recent.map((record) => record.percentage));
  const previous = records.slice(0, -3);
  const previousAverage = previous.length ? average(previous.map((record) => record.percentage)) : null;
  const slopeDecline = Math.max(0, -regressionSlope(percentages) * Math.min(3, percentages.length - 1));
  const averageDecline = previousAverage === null ? 0 : Math.max(0, previousAverage - recentAverage);
  const trendDecline = Math.max(slopeDecline, averageDecline);

  let recentPoints = 0;
  if (recentAverage < 50) recentPoints = 20 + ((50 - recentAverage) / 50) * 20;
  else if (recentAverage <= 60) recentPoints = ((60 - recentAverage) / 10) * 20;

  const trendPoints = Math.min(30, trendDecline * 1.5);
  let inactivityDays: number | null = null;
  if (input.lastActivityDate) {
    inactivityDays = Math.max(
      0,
      Math.floor((dateValue(input.asOfDate ?? new Date()) - dateValue(input.lastActivityDate)) / 86_400_000)
    );
  }
  const inactivityPoints = inactivityDays !== null && inactivityDays >= 14
    ? 20
    : inactivityDays !== null && inactivityDays >= 7 ? 15 : 0;

  const performanceQuizAttemptIds = new Set(
    records
      .map((record) => record.quizAttemptId)
      .filter((attemptId): attemptId is number => typeof attemptId === "number")
  );
  const quizPercentages = input.quizAttemptScores
    .filter((attempt) => Number.isFinite(attempt.score) && Number.isFinite(attempt.max_score) && attempt.max_score > 0)
    .filter((attempt) => attempt.attemptId === undefined || !performanceQuizAttemptIds.has(attempt.attemptId))
    .map((attempt) => percentage(attempt.score, attempt.max_score));
  const quizAverage = quizPercentages.length ? average(quizPercentages) : null;
  const quizPoints = quizAverage !== null && quizAverage < 50 ? ((50 - quizAverage) / 50) * 10 : 0;
  const score = Math.min(100, Math.round(recentPoints + trendPoints + inactivityPoints + quizPoints));
  const level = riskLevel(score);

  const reasons: string[] = [
    `Your latest 3 assessment average is ${Math.round(recentAverage)}% (${recent.length} records).`,
  ];
  if (trendDecline >= 5) {
    if (previousAverage !== null && averageDecline >= 5) {
      reasons.push(`Your average declined from ${Math.round(previousAverage)}% to ${Math.round(recentAverage)}% across the latest records.`);
    } else {
      reasons.push(`Your assessment results are declining by about ${Math.round(trendDecline)} percentage points across recent records.`);
    }
  }
  if (inactivityDays !== null && inactivityDays >= 7) {
    reasons.push(`You have had no recorded study activity for ${inactivityDays} days; your current streak is ${input.currentStreak} days.`);
  }
  if (quizAverage !== null && quizAverage < 50) {
    reasons.push(`Your completed quiz average is ${Math.round(quizAverage)}% across ${quizPercentages.length} attempts.`);
  }

  const subjects = new Map<string, RiskPerformanceRecord[]>();
  for (const record of records) {
    const key = record.subjectId === undefined ? record.subject : `${record.subjectId}:${record.subject}`;
    const subjectRecords = subjects.get(key) ?? [];
    subjectRecords.push(record);
    subjects.set(key, subjectRecords);
  }
  const subjectBreakdown = [...subjects.values()].map((subjectRecords) => {
    const subjectAverage = average(subjectRecords.map((record) => percentage(record.score, record.max_score)));
    const subject = subjectRecords[0].subject;
    return {
      subjectId: subjectRecords[0].subjectId,
      subject,
      averageScore: round(subjectAverage),
      recordCount: subjectRecords.length,
      reasons: [`${subject} average is ${Math.round(subjectAverage)}% across ${subjectRecords.length} records.`],
    };
  }).sort((left, right) => left.averageScore - right.averageScore);

  const suggestions: string[] = [];
  const weakestSubject = subjectBreakdown[0];
  if (averageDecline >= 5 && previousAverage !== null) {
    suggestions.push(`Review ${weakestSubject.subject}, your average dropped from ${Math.round(previousAverage)}% to ${Math.round(recentAverage)}%.`);
  } else if (trendDecline >= 5) {
    suggestions.push(`Review ${weakestSubject.subject}; your recent assessment results are trending down.`);
  } else if (recentAverage < 60) {
    suggestions.push(`Review ${weakestSubject.subject} and practise the topics from your latest assessments.`);
  }
  if (inactivityDays !== null && inactivityDays >= 7) {
    suggestions.push("Plan a short study session today to restart your routine.");
  }
  if (quizAverage !== null && quizAverage < 50) {
    suggestions.push("Try a practice quiz and review the questions you missed.");
  }
  if (!suggestions.length) suggestions.push("Keep logging assessment results and maintain your study routine.");

  return {
    score,
    level,
    reasons,
    suggestions,
    subjectBreakdown,
    signals: {
      recentAverage: round(recentAverage),
      trendDecline: round(trendDecline),
      inactivityDays,
      quizAverage: quizAverage === null ? null : round(quizAverage),
    },
  };
}
