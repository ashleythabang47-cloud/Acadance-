import { isMultipleChoiceCorrect, calculatePercentage, isValidScore } from "../utils/grading";

describe("isMultipleChoiceCorrect", () => {
  it("matches identical letters", () => {
    expect(isMultipleChoiceCorrect("A", "A")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMultipleChoiceCorrect("b", "B")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isMultipleChoiceCorrect(" c ", "C")).toBe(true);
  });

  it("rejects a wrong answer", () => {
    expect(isMultipleChoiceCorrect("A", "D")).toBe(false);
  });

  it("rejects when there is no correct answer on record", () => {
    expect(isMultipleChoiceCorrect("A", null)).toBe(false);
  });
});

describe("calculatePercentage", () => {
  it("computes a simple percentage", () => {
    expect(calculatePercentage(7, 10)).toBe(70);
  });

  it("rounds to the nearest whole number", () => {
    expect(calculatePercentage(1, 3)).toBe(33);
  });

  it("returns 0 for a zero maxScore instead of dividing by zero", () => {
    expect(calculatePercentage(5, 0)).toBe(0);
  });

  it("returns 100 for a perfect score", () => {
    expect(calculatePercentage(10, 10)).toBe(100);
  });
});

describe("isValidScore", () => {
  it("accepts a normal in-range score", () => {
    expect(isValidScore(80, 100)).toBe(true);
  });

  it("rejects a negative score", () => {
    expect(isValidScore(-5, 100)).toBe(false);
  });

  it("rejects a score exceeding maxScore", () => {
    expect(isValidScore(120, 100)).toBe(false);
  });

  it("rejects a zero or negative maxScore", () => {
    expect(isValidScore(5, 0)).toBe(false);
    expect(isValidScore(5, -10)).toBe(false);
  });

  it("accepts a score equal to maxScore", () => {
    expect(isValidScore(100, 100)).toBe(true);
  });
});
