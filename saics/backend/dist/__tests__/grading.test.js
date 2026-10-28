"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const grading_1 = require("../utils/grading");
describe("isMultipleChoiceCorrect", () => {
    it("matches identical letters", () => {
        expect((0, grading_1.isMultipleChoiceCorrect)("A", "A")).toBe(true);
    });
    it("is case-insensitive", () => {
        expect((0, grading_1.isMultipleChoiceCorrect)("b", "B")).toBe(true);
    });
    it("tolerates surrounding whitespace", () => {
        expect((0, grading_1.isMultipleChoiceCorrect)(" c ", "C")).toBe(true);
    });
    it("rejects a wrong answer", () => {
        expect((0, grading_1.isMultipleChoiceCorrect)("A", "D")).toBe(false);
    });
    it("rejects when there is no correct answer on record", () => {
        expect((0, grading_1.isMultipleChoiceCorrect)("A", null)).toBe(false);
    });
});
describe("calculatePercentage", () => {
    it("computes a simple percentage", () => {
        expect((0, grading_1.calculatePercentage)(7, 10)).toBe(70);
    });
    it("rounds to the nearest whole number", () => {
        expect((0, grading_1.calculatePercentage)(1, 3)).toBe(33);
    });
    it("returns 0 for a zero maxScore instead of dividing by zero", () => {
        expect((0, grading_1.calculatePercentage)(5, 0)).toBe(0);
    });
    it("returns 100 for a perfect score", () => {
        expect((0, grading_1.calculatePercentage)(10, 10)).toBe(100);
    });
});
describe("isValidScore", () => {
    it("accepts a normal in-range score", () => {
        expect((0, grading_1.isValidScore)(80, 100)).toBe(true);
    });
    it("rejects a negative score", () => {
        expect((0, grading_1.isValidScore)(-5, 100)).toBe(false);
    });
    it("rejects a score exceeding maxScore", () => {
        expect((0, grading_1.isValidScore)(120, 100)).toBe(false);
    });
    it("rejects a zero or negative maxScore", () => {
        expect((0, grading_1.isValidScore)(5, 0)).toBe(false);
        expect((0, grading_1.isValidScore)(5, -10)).toBe(false);
    });
    it("accepts a score equal to maxScore", () => {
        expect((0, grading_1.isValidScore)(100, 100)).toBe(true);
    });
});
