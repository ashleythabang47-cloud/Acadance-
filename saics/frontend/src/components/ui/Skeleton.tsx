// Shimmering placeholders shown while data loads, so layouts don't jump.
export function SkeletonBlock({ height = 16, width = "100%", radius = 8 }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div className="skeleton-chart" style={{ height }} aria-busy="true" aria-label="Loading chart">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="skeleton" style={{ height: `${25 + ((i * 37) % 60)}%` }} />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <SkeletonBlock height={36} width={36} radius={10} />
          <div style={{ flex: 1, display: "grid", gap: 8 }}>
            <SkeletonBlock height={12} width="55%" />
            <SkeletonBlock height={10} width="35%" />
          </div>
        </div>
      ))}
    </div>
  );
}
