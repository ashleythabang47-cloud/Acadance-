import { useMemo, useState } from "react";
import { useChartTheme } from "../../hooks/useChartTheme";

interface Day {
  date: string;
  count: number;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function parse(date: string) {
  return new Date(date + "T00:00:00");
}

// Calendar heatmap (weeks as columns, Mon→Sun rows). Magnitude uses one
// sequential hue, light→dark; empty days use a neutral cell so "no data"
// never reads as "a little data".
export default function ActivityHeatmap({ days }: { days: Day[] }) {
  const theme = useChartTheme();
  const [hover, setHover] = useState<Day | null>(null);

  const { weeks, monthLabels, max, total, activeDays } = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const max = Math.max(1, ...sorted.map((d) => d.count));
    const total = sorted.reduce((s, d) => s + d.count, 0);
    const activeDays = sorted.filter((d) => d.count > 0).length;
    const weeks: (Day | null)[][] = [];
    let week: (Day | null)[] = [];
    if (sorted.length) {
      const firstDow = (parse(sorted[0].date).getDay() + 6) % 7; // Monday = 0
      for (let i = 0; i < firstDow; i++) week.push(null);
    }
    for (const d of sorted) {
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    const monthLabels = weeks.map((w, i) => {
      const first = w.find(Boolean);
      if (!first) return "";
      const d = parse(first.date);
      const prev = i > 0 ? weeks[i - 1].find(Boolean) : null;
      const prevMonth = prev ? parse(prev.date).getMonth() : -1;
      return d.getMonth() !== prevMonth ? d.toLocaleDateString(undefined, { month: "short" }) : "";
    });
    return { weeks, monthLabels, max, total, activeDays };
  }, [days]);

  function colorFor(count: number) {
    if (count <= 0) return theme.empty;
    const steps = theme.sequential.slice(1);
    const idx = Math.min(steps.length - 1, Math.ceil((count / max) * steps.length) - 1);
    return steps[Math.max(0, idx)];
  }

  const hoverLabel = hover
    ? `${hover.count} ${hover.count === 1 ? "activity" : "activities"} on ${parse(hover.date).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : `${total} activities across ${activeDays} active ${activeDays === 1 ? "day" : "days"}`;

  return (
    <div className="heatmap">
      <div className="heatmap-scroll">
        <div className="heatmap-grid" role="grid" aria-label="Daily study activity">
          <div className="heatmap-daylabels" aria-hidden="true">
            <span />
            {DAY_LABELS.map((l, i) => <span key={i}>{l}</span>)}
          </div>
          {weeks.map((w, wi) => (
            <div className="heatmap-week" key={wi} role="row">
              <span className="heatmap-month" aria-hidden="true">{monthLabels[wi]}</span>
              {w.map((d, di) =>
                d ? (
                  <span
                    key={d.date}
                    role="gridcell"
                    tabIndex={0}
                    className={`heatmap-cell ${hover?.date === d.date ? "is-hover" : ""}`}
                    style={{ background: colorFor(d.count) }}
                    aria-label={`${d.date}: ${d.count} activities`}
                    onMouseEnter={() => setHover(d)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(d)}
                    onBlur={() => setHover(null)}
                  />
                ) : (
                  <span key={`pad-${wi}-${di}`} className="heatmap-cell pad" aria-hidden="true" />
                )
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-foot">
        <span className="heatmap-readout">{hoverLabel}</span>
        <span className="heatmap-legend" aria-hidden="true">
          Less
          <span className="heatmap-cell" style={{ background: theme.empty }} />
          {theme.sequential.slice(1).map((c) => <span key={c} className="heatmap-cell" style={{ background: c }} />)}
          More
        </span>
      </div>
    </div>
  );
}
