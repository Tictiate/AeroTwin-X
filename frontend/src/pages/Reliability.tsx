import { useAppData } from "../context/AppDataContext";
import { Bar } from "../components/Bar";
import { humanize, statusTier } from "../lib/status";
import { deriveAdvisory } from "../lib/advisory";

function degradationTier(value: number) {
  if (value < 0.1) return "healthy" as const;
  if (value < 0.3) return "caution" as const;
  return "degraded" as const;
}

export default function Reliability() {
  const { snapshot } = useAppData();
  const health = snapshot?.health ?? null;
  const degradation = snapshot?.degradation ?? null;
  const rul = snapshot?.rul ?? null;
  const analysis = snapshot?.analysis ?? null;

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">Reliability</span>
        <h1>How healthy is the engine, how is it degrading, and what should we do?</h1>
      </div>

      {/* HEALTH -- visually dominant */}
      <div className="section">
        <div className="panel" style={{ padding: "var(--space-6)" }}>
          {!health ? (
            <div className="state-block"><span className="headline">Health unavailable</span></div>
          ) : (
            <div className="grid-2" style={{ alignItems: "center", gap: "var(--space-7)" }}>
              <div className="metric-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
                <span className="eyebrow">Engine Health</span>
                <div className="value" data-tier={statusTier(health.status)}>
                  {health.overallHealth.toFixed(1)}
                  <small>/ 100</small>
                </div>
                <span className="status-tag" data-tier={statusTier(health.status)}>
                  <span>{humanize(health.status)}</span>
                </span>
                <span className="note">Trend: {humanize(health.trend.direction)} ({health.trend.ratePerHour.toFixed(2)}/hr)</span>
              </div>
              <div>
                {Object.entries(health.subsystems).map(([name, score]) => (
                  <Bar key={name} label={humanize(name)} value={score} tier={statusTier(score >= 90 ? "HEALTHY" : score >= 75 ? "CAUTION" : score >= 50 ? "DEGRADED" : "CRITICAL")} formatValue={(v) => v.toFixed(0)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* DEGRADATION */}
        <div className="section">
          <div className="section-head"><h2>Degradation</h2></div>
          <div className="panel">
            {!degradation ? (
              <div className="state-block">Degradation unavailable.</div>
            ) : (
              <>
                <div className="data-row"><span className="label">Overall degradation</span><span className="value">{(degradation.overallDegradation * 100).toFixed(1)}%</span></div>
                <div className="data-row"><span className="label">Degradation rate</span><span className="value">{degradation.degradationRatePerHour.toFixed(3)} / hr</span></div>
                <div className="data-row"><span className="label">Dominant mechanism</span><span className="value">{humanize(degradation.dominantMechanism)}</span></div>
                <div className="data-row"><span className="label">Trend</span><span className="value">{humanize(degradation.trend)}</span></div>
                <div className="data-row"><span className="label">Data quality</span><span className="value">{humanize(degradation.dataQuality)} · {degradation.historySamples} samples</span></div>
                <div style={{ marginTop: 12 }}>
                  <span className="eyebrow">Component degradation</span>
                  <div style={{ marginTop: 6 }}>
                    {Object.entries(degradation.componentDegradation).map(([name, value]) => (
                      <Bar key={name} label={humanize(name)} value={value * 100} tier={degradationTier(value)} formatValue={(v) => `${v.toFixed(0)}%`} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RUL */}
        <div className="section">
          <div className="section-head"><h2>Remaining Useful Life</h2></div>
          <div className="panel">
            {!rul ? (
              <div className="state-block">RUL unavailable.</div>
            ) : rul.rulHours !== null ? (
              <div className="metric-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
                <div className="value" style={{ fontSize: 44 }}>
                  {rul.rulHours.toFixed(1)}
                  <small>hours</small>
                </div>
                <span className="note">
                  Bounds: {rul.lowerBoundHours?.toFixed(0)}–{rul.upperBoundHours?.toFixed(0)}h · confidence {(rul.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ) : (
              <div className="metric-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
                <div className="value" style={{ fontSize: 36, color: "var(--text-tertiary)" }}>—</div>
                <span className="status-tag" data-tier="unknown"><span>{humanize(rul.status)}</span></span>
                <span className="note" style={{ maxWidth: "36ch" }}>{rul.explanation}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAINTENANCE ADVISORY */}
      <div className="section">
        <div className="section-head"><h2>Maintenance Advisory</h2></div>
        <div className="panel" style={{ borderColor: health ? undefined : "var(--border-subtle)" }}>
          {!health || !analysis ? (
            <div className="state-block">Waiting for a full diagnostics snapshot…</div>
          ) : (
            (() => {
              const advisory = deriveAdvisory(health, degradation, analysis);
              return (
                <div className="grid-2" style={{ gap: "var(--space-6)" }}>
                  <div>
                    <div className="data-row"><span className="label">Requires attention</span><span className="value">{advisory.subsystem}</span></div>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{advisory.why}</p>
                  </div>
                  <div>
                    <span className="eyebrow">Recommended action</span>
                    <p style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{advisory.action}</p>
                  </div>
                </div>
              );
            })()
          )}
          <p className="footer-note" style={{ marginTop: "var(--space-4)" }}>
            Prototype engineering advisory, not a certified maintenance determination and not an autonomous
            maintenance authorization. Derived entirely from the health, degradation, RUL, and diagnosis figures
            shown above — not a second decision engine.
          </p>
        </div>
      </div>
    </>
  );
}
