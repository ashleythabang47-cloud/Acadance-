import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface StreakData {
  streak: {
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
  };
  last7Days: { date: string; count: number }[];
  /** Present only when a longer history was requested (`historyDays`). */
  activity?: { date: string; count: number }[];
}

export function useStreak(checkInOnLoad = false, historyDays?: number) {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (checkInOnLoad) {
          await api.post("/streaks/checkin").catch(() => {});
        }
        const res = await api.get("/streaks/me", historyDays ? { params: { days: historyDays } } : undefined);
        if (active) setData(res.data);
      } catch (err) {
        console.error("Failed to load streak data", err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [checkInOnLoad, historyDays]);

  return { data, loading, error };
}
