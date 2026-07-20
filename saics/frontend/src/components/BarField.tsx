// A field of ambient "cadence bars" used as background texture on the
// auth brand panel. Heights and animation delays are randomized once
// per mount so the rhythm never looks mechanically uniform.
export default function BarField({ count = 24 }: { count?: number }) {
  const bars = Array.from({ length: count }, (_, i) => {
    const height = 20 + Math.round(Math.random() * 70);
    const delay = (Math.random() * 3).toFixed(2);
    return (
      <div
        key={i}
        className="bar"
        style={{ height: `${height}%`, animationDelay: `${delay}s` }}
      />
    );
  });

  return <div className="bar-field">{bars}</div>;
}
