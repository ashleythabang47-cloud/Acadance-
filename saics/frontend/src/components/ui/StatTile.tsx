import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type Accent = "indigo" | "teal" | "violet" | "amber" | "blue" | "rose" | "green";

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: Accent;
  /** Signed change; renders an up/down chip. */
  delta?: number | null;
  deltaLabel?: string;
  /** Small inline trend line (values in display order). */
  spark?: number[];
  loading?: boolean;
  onClick?: () => void;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="stat-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={area} className="stat-spark-area" />
      <path d={line} className="stat-spark-line" />
      <circle cx={lx} cy={ly} r={3} className="stat-spark-dot" />
    </svg>
  );
}

export default function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  accent = "indigo",
  delta,
  deltaLabel,
  spark,
  loading,
  onClick,
}: StatTileProps) {
  const interactive = Boolean(onClick);
  const direction = delta == null || Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down";
  const DeltaIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <div
      className={`stat-tile accent-${accent} ${interactive ? "interactive" : ""}`}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="stat-tile-top">
        <span className="stat-tile-icon"><Icon size={17} /></span>
        <span className="stat-tile-label">{label}</span>
      </div>
      {loading ? (
        <div className="skeleton skeleton-text-lg" />
      ) : (
        <div className="stat-tile-body">
          <p className="stat-tile-value">
            {value}
            {unit && <span className="stat-tile-unit">{unit}</span>}
          </p>
          {spark && <Sparkline values={spark} />}
        </div>
      )}
      <div className="stat-tile-foot">
        {delta != null && !loading && (
          <span className={`stat-delta ${direction}`}>
            <DeltaIcon size={12} />
            {direction === "flat" ? "steady" : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`}
            {deltaLabel && direction !== "flat" ? ` ${deltaLabel}` : ""}
          </span>
        )}
        {hint && <span className="stat-tile-hint">{hint}</span>}
      </div>
    </div>
  );
}
