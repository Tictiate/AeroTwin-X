import { useState } from "react";
import type { SnapshotHistoryPoint } from "../context/AppDataContext";
import { RESIDUAL_CHANNELS, type ResidualChannel } from "../lib/channels";

/**
 * The AeroTwin-X signature visualization: the live engine signal plotted
 * against the physics-expected state over time, for the channel the operator
 * selects. Healthy = the two lines track each other closely. Fault = they
 * visibly separate. Every point is a real telemetry/physicsPrediction tick
 * already retained in AppDataContext's rolling history -- no new calculation,
 * no invented samples.
 */

type Tier = "healthy" | "caution" | "degraded";

function magnitudeTier(normalized: number): Tier {
  const m = Math.abs(normalized);
  if (m < 0.15) return "healthy";
  if (m < 0.4) return "caution";
  return "degraded";
}

const INTERPRETATION: Record<Tier, string> = {
  healthy: "Actual is tracking the physics-expected state.",
  caution: "Early divergence from the physics-expected state.",
  degraded: "Actual is diverging from the physics-expected state.",
};

const CHART_W = 480;
const CHART_H = 150;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 10;

function buildPath(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function ActualVsExpected({
  history,
  channels = RESIDUAL_CHANNELS,
  size = "full",
}: {
  history: SnapshotHistoryPoint[];
  channels?: ResidualChannel[];
  size?: "compact" | "full";
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const channel = channels[Math.min(activeIdx, channels.length - 1)];
  const latest = history[history.length - 1] ?? null;

  return (
    <div className={`avx ${size === "compact" ? "avx-compact" : ""}`}>
      <div className="avx-tabs" role="tablist" aria-label="Physics channel">
        {channels.map((c, i) => (
          <button
            key={c.label}
            role="tab"
            aria-selected={i === activeIdx}
            className={`avx-tab ${i === activeIdx ? "active" : ""}`}
            onClick={() => setActiveIdx(i)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!latest ? (
        <div className="avx-chart-wrap">
          <span className="avx-building">Waiting for telemetry…</span>
        </div>
      ) : (
        <AvxChannel channel={channel} history={history} latest={latest} />
      )}
    </div>
  );
}

function AvxChannel({
  channel,
  history,
  latest,
}: {
  channel: ResidualChannel;
  history: SnapshotHistoryPoint[];
  latest: SnapshotHistoryPoint;
}) {
  const normalized = latest.residuals[channel.normalized] as number;
  const tier = magnitudeTier(normalized);
  const actualNow = latest.telemetry[channel.actual] as number;
  const expectedNow = latest.physicsPrediction[channel.expected] as number;
  const residualNow = latest.residuals[channel.residual] as number;

  const series = history.map((h) => ({
    t: h.t,
    actual: h.telemetry[channel.actual] as number,
    expected: h.physicsPrediction[channel.expected] as number,
  }));
  const single = series.length < 2;

  const tMin = series[0].t;
  const tMax = series[series.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);

  const values = series.flatMap((s) => [s.actual, s.expected]);
  let vMin = Math.min(...values);
  let vMax = Math.max(...values);
  if (vMax - vMin < 1e-6) {
    vMin -= 1;
    vMax += 1;
  }
  const vPad = (vMax - vMin) * 0.15;
  vMin -= vPad;
  vMax += vPad;

  const xOf = (t: number) => PAD_L + ((t - tMin) / tSpan) * (CHART_W - PAD_L - PAD_R);
  const yOf = (v: number) => PAD_T + (1 - (v - vMin) / (vMax - vMin)) * (CHART_H - PAD_T - PAD_B);

  const actualPts = series.map((s) => ({ x: xOf(s.t), y: yOf(s.actual) }));
  const expectedPts = series.map((s) => ({ x: xOf(s.t), y: yOf(s.expected) }));
  const lastPt = actualPts[actualPts.length - 1];

  return (
    <>
      <div className="avx-chart-wrap">
        <svg
          className="avx-chart"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${channel.label}: actual versus physics-expected over time`}
        >
          {[0.25, 0.5, 0.75].map((f) => {
            const y = PAD_T + f * (CHART_H - PAD_T - PAD_B);
            return <line key={f} x1={PAD_L} x2={CHART_W - PAD_R} y1={y} y2={y} className="avx-gridline" />;
          })}
          {!single && <path d={buildPath(expectedPts)} className="avx-expected-line" />}
          {!single && <path d={buildPath(actualPts)} className="avx-actual-line" data-tier={tier} />}
          <circle cx={lastPt.x} cy={lastPt.y} r={3.6} className="avx-actual-dot" data-tier={tier} />
        </svg>
        {single && <span className="avx-building">Building trend…</span>}
      </div>

      <div className="avx-legend">
        <span className="avx-legend-item">
          <span className="avx-legend-swatch actual" data-tier={tier} /> Actual
        </span>
        <span className="avx-legend-item">
          <span className="avx-legend-swatch expected" /> Expected (physics)
        </span>
      </div>

      <div className="avx-readout">
        <p className="avx-interpretation" data-tier={tier}>
          {INTERPRETATION[tier]}
        </p>
        <div className="avx-now">
          <span className="avx-now-item">
            <span className="avx-now-label">Actual</span>
            <span className="avx-now-value mono">
              {actualNow.toFixed(channel.decimals)}
              {channel.unit ? ` ${channel.unit}` : ""}
            </span>
          </span>
          <span className="avx-now-item">
            <span className="avx-now-label">Expected</span>
            <span className="avx-now-value mono">
              {expectedNow.toFixed(channel.decimals)}
              {channel.unit ? ` ${channel.unit}` : ""}
            </span>
          </span>
          <span className="avx-now-item">
            <span className="avx-now-label">Δ Residual</span>
            <span className="avx-now-value mono" data-tier={tier}>
              {residualNow >= 0 ? "+" : ""}
              {residualNow.toFixed(channel.decimals)}
              {channel.unit ? ` ${channel.unit}` : ""}
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
