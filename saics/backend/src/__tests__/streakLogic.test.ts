import { daysBetween, computeNextStreak } from "../utils/streakLogic";

describe("daysBetween", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetween("2026-07-20", "2026-07-20")).toBe(0);
  });

  it("returns 1 for consecutive days", () => {
    expect(daysBetween("2026-07-20", "2026-07-21")).toBe(1);
  });

  it("returns a larger gap correctly", () => {
    expect(daysBetween("2026-07-20", "2026-07-25")).toBe(5);
  });

  it("handles a month boundary", () => {
    expect(daysBetween("2026-07-31", "2026-08-01")).toBe(1);
  });
});

describe("computeNextStreak", () => {
  it("starts a fresh streak when there is no prior activity", () => {
    const result = computeNextStreak(
      { current_streak: 0, longest_streak: 0, last_activity_date: null },
      "2026-07-20"
    );
    expect(result.current_streak).toBe(1);
    expect(result.longest_streak).toBe(1);
    expect(result.changed).toBe(true);
  });

  it("extends the streak on a consecutive day", () => {
    const result = computeNextStreak(
      { current_streak: 4, longest_streak: 5, last_activity_date: "2026-07-19" },
      "2026-07-20"
    );
    expect(result.current_streak).toBe(5);
    expect(result.longest_streak).toBe(5);
  });

  it("updates longest_streak when current streak surpasses it", () => {
    const result = computeNextStreak(
      { current_streak: 5, longest_streak: 5, last_activity_date: "2026-07-19" },
      "2026-07-20"
    );
    expect(result.current_streak).toBe(6);
    expect(result.longest_streak).toBe(6);
  });

  it("resets to 1 after missing a day", () => {
    const result = computeNextStreak(
      { current_streak: 10, longest_streak: 10, last_activity_date: "2026-07-15" },
      "2026-07-20"
    );
    expect(result.current_streak).toBe(1);
    expect(result.longest_streak).toBe(10); // longest streak is preserved, not reset
  });

  it("does not change anything if activity was already logged today", () => {
    const result = computeNextStreak(
      { current_streak: 3, longest_streak: 5, last_activity_date: "2026-07-20" },
      "2026-07-20"
    );
    expect(result.changed).toBe(false);
    expect(result.current_streak).toBe(3);
  });
});
