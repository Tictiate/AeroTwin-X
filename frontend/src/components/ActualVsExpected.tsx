import type { PhysicsPrediction, PhysicsResidual, Telemetry } from "../api/types";
import { RESIDUAL_CHANNELS, type ResidualChannel } from "../lib/channels";

/**
 * The signature "actual vs expected" visualization: for each channel, the
 * physics-predicted value is a fixed centerline and the live actual value is
 * a mark offset by its real normalized residual. Aligned = healthy, visibly
 * split = deviation. No new calculation -- purely a visual encoding of the
 * residuals already computed by the physics service.
 */

function magnitudeTier(normalized: number): "healthy" | "caution" | "degraded" {
  const m = Math.abs(normalized);
  if (m < 0.15) return "healthy";
  if (m < 0.4) return "caution";
  return "degraded";
}

export function ActualVsExpected({
  telemetry,
  physicsPrediction,
  residuals,
  channels = RESIDUAL_CHANNELS,
}: {
  telemetry: Telemetry;
  physicsPrediction: PhysicsPrediction;
  residuals: PhysicsResidual;
  channels?: ResidualChannel[];
}) {
  return (
    <div className="avx-grid">
      {channels.map((c) => {
        const actual = telemetry[c.actual] as number;
        const expected = physicsPrediction[c.expected] as number;
        const normalized = residuals[c.normalized] as number;
        const tier = magnitudeTier(normalized);
        const clamped = Math.max(-1, Math.min(1, normalized));
        const actualPct = 50 + clamped * 42;

        return (
          <div className="avx-row" key={c.label}>
            <span className="avx-label">{c.label}</span>
            <div className="avx-track" data-tier={tier}>
              <span className="avx-expected-mark" aria-hidden="true" />
              <span className="avx-actual-mark" style={{ left: `${actualPct}%` }} aria-hidden="true" />
            </div>
            <span className="avx-values mono">
              {actual.toFixed(c.decimals)}
              <span className="avx-vs">vs</span>
              {expected.toFixed(c.decimals)}
              {c.unit ? ` ${c.unit}` : ""}
            </span>
          </div>
        );
      })}
      <p className="avx-legend">
        <span className="avx-legend-item"><span className="avx-legend-mark expected" /> Physics-expected</span>
        <span className="avx-legend-item"><span className="avx-legend-mark actual" /> Live actual</span>
      </p>
    </div>
  );
}
