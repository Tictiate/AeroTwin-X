import type { DegradationState, RulEstimate } from "../api/types";
import { humanize } from "../lib/status";
import { Bar } from "./Bar";
import { StatusPill } from "./StatusPill";

export function DegradationRulPanel({
  degradation,
  rul,
}: {
  degradation: DegradationState | null;
  rul: RulEstimate | null;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Degradation &amp; Remaining Useful Life</h2>
        {rul && <StatusPill value={rul.status} />}
      </div>

      {!degradation || !rul ? (
        <p className="panel-empty">Degradation/RUL unavailable.</p>
      ) : (
        <>
          <div className="big-stat">
            <span className="value">{rul.rulHours != null ? rul.rulHours.toFixed(1) : "—"}</span>
            <span className="unit">
              hours{rul.rulHours != null && ` (${rul.lowerBoundHours?.toFixed(0)}–${rul.upperBoundHours?.toFixed(0)} bound)`}
            </span>
          </div>
          <p className="interpretation">{rul.explanation}</p>

          <div className="stat-line">
            <span className="k">Overall degradation</span>
            <span>{(degradation.overallDegradation * 100).toFixed(1)}%</span>
          </div>
          <div className="stat-line">
            <span className="k">Degradation rate</span>
            <span>{degradation.degradationRatePerHour.toFixed(3)} / hr</span>
          </div>
          <div className="stat-line">
            <span className="k">Dominant mechanism</span>
            <span>{humanize(degradation.dominantMechanism)}</span>
          </div>
          <div className="stat-line">
            <span className="k">Trend</span>
            <span>{humanize(degradation.trend)}</span>
          </div>
          <div className="stat-line">
            <span className="k">Data quality</span>
            <span>
              {humanize(degradation.dataQuality)} · {degradation.historySamples} samples · confidence{" "}
              {(degradation.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="panel-title" style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: 10.5 }}>Component degradation</h2>
            </div>
            {Object.entries(degradation.componentDegradation).map(([name, value]) => (
              <Bar
                key={name}
                label={name}
                value={value * 100}
                tier={value < 0.1 ? "healthy" : value < 0.3 ? "caution" : "degraded"}
                formatValue={(v) => `${v.toFixed(0)}%`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
