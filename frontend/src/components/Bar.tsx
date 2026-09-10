import type { StatusTier } from "../lib/status";

/** Horizontal 0-100 bar, e.g. subsystem health or fault probability. */
export function Bar({
  label,
  value,
  max = 100,
  tier,
  formatValue,
}: {
  label: string;
  value: number;
  max?: number;
  tier?: StatusTier;
  formatValue?: (value: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar-row">
      <span className="label">{label}</span>
      <span className="bar-track">
        <span className={`bar-fill${tier ? ` ${tier}` : ""}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="value">{formatValue ? formatValue(value) : value.toFixed(0)}</span>
    </div>
  );
}

/** Diverging bar centered at 0, for signed residuals in range [-limit, +limit]. */
export function DivergeBar({ label, value, limit = 1 }: { label: string; value: number; limit?: number }) {
  const clamped = Math.max(-limit, Math.min(limit, value));
  const pct = Math.min(50, (Math.abs(clamped) / limit) * 50);
  return (
    <div className="bar-row">
      <span className="label">{label}</span>
      <span className="diverge-track">
        <span
          className={`diverge-fill ${value >= 0 ? "pos" : "neg"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="value">{value >= 0 ? "+" : ""}{value.toFixed(2)}</span>
    </div>
  );
}
