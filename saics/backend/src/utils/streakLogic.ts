export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * mysql2 returns DATE columns as JS Date objects (local midnight) unless the
 * pool is configured with dateStrings. Normalise either shape to YYYY-MM-DD
 * so it can be compared with the keys produced by toDateString().
 */
export function normalizeDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

export function daysBetween(a: string, b: string): number {
  const dateA = new Date(a + "T00:00:00Z");
  const dateB = new Date(b + "T00:00:00Z");
  return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Given the existing streak state and today's date, works out what the
 * new current/longest streak should be. This is the actual rule from the
 * dissertation proposal: consecutive days extend the streak, a gap of
 * more than one day resets it to 1, and activity already logged today
 * doesn't double-count.
 */
export function computeNextStreak(
  existing: { current_streak: number; longest_streak: number; last_activity_date: string | null },
  today: string
): { current_streak: number; longest_streak: number; last_activity_date: string; changed: boolean } {
  if (existing.last_activity_date === today) {
    return { ...existing, last_activity_date: today, changed: false };
  }

  let newCurrent: number;
  if (existing.last_activity_date) {
    const gap = daysBetween(existing.last_activity_date, today);
    newCurrent = gap === 1 ? existing.current_streak + 1 : 1;
  } else {
    newCurrent = 1;
  }
  const newLongest = Math.max(existing.longest_streak, newCurrent);

  return {
    current_streak: newCurrent,
    longest_streak: newLongest,
    last_activity_date: today,
    changed: true,
  };
}
