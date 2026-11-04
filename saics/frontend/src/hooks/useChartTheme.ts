import { useTheme } from "../context/ThemeContext";

// Recharts writes colours into SVG attributes, where CSS custom properties
// aren't reliable across browsers — so charts get concrete hex values per
// theme. Both categorical sets were run through the CVD/contrast validator
// against their own surface (light #fff, dark #0d0d10) and pass; dark mode
// is its own set of steps, not an automatic flip.
const LIGHT = {
  series: ["#4f46e5", "#0d9488", "#c026d3", "#d97706", "#2563eb"],
  // Sequential (single hue, light → dark) for magnitude, e.g. the heatmap.
  sequential: ["#eef0fd", "#c7cbf8", "#9aa1f1", "#6d6ae9", "#4338ca"],
  empty: "#f1f0f4",
  grid: "#ecebf0",
  axis: "#8a8893",
  ink: "#0b0b0f",
  inkSoft: "#68666f",
  surface: "#ffffff",
  status: { good: "#16a34a", warning: "#d97706", critical: "#dc2626" },
};

const DARK = {
  series: ["#6366f1", "#0d9488", "#d946ef", "#d97706", "#3b82f6"],
  sequential: ["#1b1b2e", "#2e2f6b", "#4542a8", "#6366f1", "#a5b4fc"],
  empty: "#18181c",
  grid: "#1f1f24",
  axis: "#7c7b85",
  ink: "#f5f5f7",
  inkSoft: "#9d9ca6",
  surface: "#0d0d10",
  status: { good: "#4ade80", warning: "#fbbf24", critical: "#f87171" },
};

export type ChartTheme = typeof LIGHT;

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
