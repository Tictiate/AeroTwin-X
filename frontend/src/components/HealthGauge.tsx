/**
 * An aerospace-instrument style health gauge: a 270-degree arc dial with
 * tick marks and a needle, in the spirit of an engine gauge cluster --
 * deliberately not a smooth full-circle "smartwatch" progress ring.
 * Pure presentation over the existing real health value/status; no new
 * calculation.
 */

const START_ANGLE = -135;
const END_ANGLE = 135;
const SWEEP = END_ANGLE - START_ANGLE;
const CX = 100;
const CY = 100;
const R = 78;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function polar(r: number, angleDeg: number): { x: number; y: number } {
  const rad = toRad(angleDeg);
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function arcPath(r: number, a0: number, a1: number): string {
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

const MAJOR_TICKS = [0, 0.25, 0.5, 0.75, 1];
const MINOR_TICKS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.35, 0.4, 0.45, 0.55, 0.6, 0.65, 0.7, 0.8, 0.85, 0.9, 0.95];

export function HealthGauge({
  value,
  statusLabel,
  tier,
  note,
}: {
  value: number | null;
  statusLabel: string;
  tier: string;
  note?: string;
}) {
  const pct = value === null ? null : Math.max(0, Math.min(100, value)) / 100;
  const valueAngle = pct === null ? START_ANGLE : START_ANGLE + SWEEP * pct;
  const needleTip = polar(R - 18, valueAngle);

  return (
    <div className="health-gauge">
      <svg className="health-gauge-svg" viewBox="0 0 200 200" role="img" aria-label={`Engine health ${value ?? "unavailable"} of 100, ${statusLabel}`}>
        <path d={arcPath(R, START_ANGLE, END_ANGLE)} className="health-gauge-track" />
        {MINOR_TICKS.map((f) => {
          const a = START_ANGLE + SWEEP * f;
          const p1 = polar(R + 3, a);
          const p2 = polar(R + 8, a);
          return <line key={f} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="health-gauge-tick" />;
        })}
        {MAJOR_TICKS.map((f) => {
          const a = START_ANGLE + SWEEP * f;
          const p1 = polar(R + 2, a);
          const p2 = polar(R + 11, a);
          return <line key={f} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="health-gauge-tick major" />;
        })}
        {pct !== null && <path d={arcPath(R, START_ANGLE, valueAngle)} className="health-gauge-value" data-tier={tier} />}
        {pct !== null && (
          <line x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y} className="health-gauge-needle" data-tier={tier} />
        )}
        <circle cx={CX} cy={CY} r="4.5" className="health-gauge-hub" />
      </svg>
      <div className="health-gauge-readout">
        <span className="eyebrow">Engine Health</span>
        <div className="health-gauge-value-text" data-tier={tier}>
          {value !== null ? value.toFixed(1) : "—"}
          <small>/ 100</small>
        </div>
        <span className="status-tag" data-tier={tier}>
          <span>{statusLabel}</span>
        </span>
        {note && <span className="note">{note}</span>}
      </div>
    </div>
  );
}
