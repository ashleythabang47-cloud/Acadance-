export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
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
