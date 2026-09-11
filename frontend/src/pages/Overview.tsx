import { useAppData } from "../context/AppDataContext";
import { useMissionSnapshot } from "../hooks/useMissionSnapshot";
import { EngineTwin } from "../components/twin3d/EngineTwin";
import { SimulatorControl } from "../components/SimulatorControl";
import { humanize, statusTier } from "../lib/status";

function alertHeadline(diagnosticType: string, status: string, faultType: string | null): string {
  if (diagnosticType === "PHYSICAL_FAULT" && faultType) {
    return `Physical fault indicators active: ${humanize(faultType)}.`;
  }
  if (diagnosticType === "SENSOR_FAULT") {
    return "Sensor fault isolated — physical engine health unaffected.";
  }
  if (status === "HEALTHY") {
    return "No active fault detected. Engine operating within nominal bounds.";
  }
  return "Health trending outside nominal bounds — no corroborated fault diagnosis yet.";
}

export default function Overview() {
  const { diagnostics, snapshot, effectiveTelemetry, simulatorFault, refreshSimulatorFault } = useAppData();
  const health = snapshot?.health ?? null;
  const rul = snapshot?.rul ?? null;
  const mission = useMissionSnapshot(snapshot?.degradation ?? null, rul?.rulHours ?? null, health?.diagnosticType ?? null);

  const tier = statusTier(health?.status ?? null);
  const outage = diagnostics.kind === "unavailable" || diagnostics.kind === "error";

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">Overview</span>
        <h1>How is the engine doing right now?</h1>
      </div>

      {outage && (
        <div className="section panel state-block critical" style={{ marginBottom: "var(--space-6)" }}>
          <span className="headline">Service unavailable</span>
          {diagnostics.kind === "unavailable" ? diagnostics.body.message : diagnostics.kind === "error" ? diagnostics.message : ""}
          {" — showing the last synchronized telemetry below."}
        </div>
      )}

      <div className="grid-2" style={{ alignItems: "start", marginBottom: "var(--space-7)" }}>
        <div className="panel">
          <div className="metric-hero">
            <span className="eyebrow">Engine Health</span>
            <div className="value" data-tier={tier}>
              {health ? health.overallHealth.toFixed(1) : "—"}
              <small>/ 100</small>
            </div>
            <span className="status-tag" data-tier={tier}>
              <span>{health ? humanize(health.status) : "Unavailable"}</span>
            </span>
            <span className="note">{health ? `Trend: ${humanize(health.trend.direction)}` : "Waiting for diagnostics…"}</span>
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">Live Digital Twin</span>
          <EngineTwin telemetry={effectiveTelemetry} health={health} activeFault={simulatorFault?.faultType ?? "NORMAL"} compact />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Key Telemetry</h2>
        </div>
        <div className="grid-auto">
          <div className="panel">
            <div className="data-row"><span className="label">RPM</span><span className="value">{effectiveTelemetry ? Math.round(effectiveTelemetry.rpm) : "—"}</span></div>
          </div>
          <div className="panel">
            <div className="data-row"><span className="label">EGT</span><span className="value">{effectiveTelemetry ? `${effectiveTelemetry.egt.toFixed(0)}°C` : "—"}</span></div>
          </div>
          <div className="panel">
            <div className="data-row"><span className="label">CHT</span><span className="value">{effectiveTelemetry ? `${effectiveTelemetry.cht.toFixed(0)}°C` : "—"}</span></div>
          </div>
          <div className="panel">
            <div className="data-row"><span className="label">Oil Pressure</span><span className="value">{effectiveTelemetry ? `${effectiveTelemetry.oilPressure.toFixed(0)} kPa` : "—"}</span></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <span className="eyebrow">Mission Status</span>
          {mission.result ? (
            <div style={{ marginTop: 10 }}>
              <span className="status-tag" data-tier={statusTier(mission.result.riskBand)}>
                <span>{humanize(mission.result.operatorRecommendation)}</span>
              </span>
              <div className="data-row" style={{ marginTop: 10 }}>
                <span className="label">Reliability</span>
                <span className="value">{(mission.result.missionReliabilityScore * 100).toFixed(1)}%</span>
              </div>
              <div className="data-row">
                <span className="label">Projected end health</span>
                <span className="value">{mission.result.projectedEndHealth.toFixed(1)}</span>
              </div>
            </div>
          ) : (
            <p className="state-block" style={{ padding: "8px 0" }}>
              {mission.loading ? "Evaluating standard mission profile against current condition…" : "Mission status unavailable."}
            </p>
          )}
        </div>

        <div className="panel">
          <span className="eyebrow">Current Recommendation</span>
          <p style={{ fontSize: 15, marginTop: 10, lineHeight: 1.5 }}>
            {health ? alertHeadline(health.diagnosticType, health.status, health.faultType) : "Waiting for diagnostics…"}
          </p>
          <p className="note" style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
            {rul
              ? rul.rulHours !== null
                ? `RUL: ${rul.rulHours.toFixed(1)}h`
                : `RUL withheld — ${humanize(rul.status)}`
              : "RUL unavailable"}
          </p>
        </div>
      </div>

      <div className="section" style={{ marginTop: "var(--space-7)" }}>
        <SimulatorControl state={simulatorFault} onChanged={refreshSimulatorFault} />
      </div>

      <p className="footer-note">
        AeroTwin-X is a physics-constrained synthetic-telemetry prototype for SIH 2026. Health, degradation, RUL and
        mission risk figures are prototype engineering estimates, not certified aircraft maintenance predictions.
      </p>
    </>
  );
}
