import type { ReactNode } from "react";

interface ProgressRingProps {
  /** 0–100 */
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  track?: string;
  children?: ReactNode;
  label?: string;
}

// A single-value radial meter. The number lives in the centre as text
// (ink colour), the arc only carries the magnitude.
export default function ProgressRing({
  value,
  size = 132,
  stroke = 10,
  color,
  track = "var(--line)",
  children,
  label,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <div className="progress-ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(clamped)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="progress-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ ["--ring-circumference" as string]: c }}
        />
      </svg>
      <div className="progress-ring-center">{children}</div>
    </div>
  );
}
