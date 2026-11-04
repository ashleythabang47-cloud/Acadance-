// A themed tooltip body for Recharts. Passed as an element
// (`content={<ChartTooltip />}`) — Recharts clones it and injects
// `active`, `payload` and `label`, so those props are all optional here.

interface PayloadItem {
  name?: string | number;
  value?: number | string | null;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: PayloadItem[];
  label?: string | number;
  /** Title shown at the top; defaults to the x-axis label. */
  titleKey?: string;
  labelFormatter?: (label: string | number | undefined, row?: Record<string, unknown>) => string;
  valueSuffix?: string;
  /** Optional extra line(s) rendered under the series values. */
  footer?: (row: Record<string, unknown>) => string | null;
}

export default function ChartTooltip({
  active,
  payload,
  label,
  titleKey,
  labelFormatter,
  valueSuffix = "",
  footer,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const title = titleKey
    ? String(row[titleKey] ?? label ?? "")
    : labelFormatter
      ? labelFormatter(label, row)
      : String(label ?? "");
  const items = payload.filter((p) => p.value !== null && p.value !== undefined);
  const extra = footer?.(row);

  return (
    <div className="chart-tooltip" role="status">
      {title && <p className="chart-tooltip-title">{title}</p>}
      {items.map((item) => (
        <p className="chart-tooltip-row" key={String(item.dataKey ?? item.name)}>
          <span className="chart-tooltip-swatch" style={{ background: item.color }} />
          <span className="chart-tooltip-name">{item.name}</span>
          <strong className="chart-tooltip-value">
            {typeof item.value === "number" ? Math.round(item.value * 10) / 10 : item.value}
            {valueSuffix}
          </strong>
        </p>
      ))}
      {extra && <p className="chart-tooltip-footer">{extra}</p>}
    </div>
  );
}
