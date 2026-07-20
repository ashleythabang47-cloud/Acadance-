import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface StreakData {
  streak: {
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
  };
  last7Days: { date: string; count: number }[];
}

export function useStreak(checkInOnLoad = false) {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (checkInOnLoad) {
          await api.post("/streaks/checkin");
        }
        const res = await api.get("/streaks/me");
        setData(res.data);
      } catch (err) {
        console.error("Failed to load streak data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [checkInOnLoad]);

  return { data, loading };
}
