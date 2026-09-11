import { useAppData } from "../context/AppDataContext";
import { Bar, DivergeBar } from "../components/Bar";
import { StatusPill } from "../components/StatusPill";
import { humanize, statusTier } from "../lib/status";
import type { PhysicsPrediction, PhysicsResidual, Telemetry } from "../api/types";

const CHANNELS: Array<{
  actual: keyof Telemetry;
  expected: keyof PhysicsPrediction;
  residual: keyof PhysicsResidual;
  normalized: keyof PhysicsResidual;
  label: string;
  decimals: number;
}> = [
  { actual: "rpm", expected: "expectedRpm", residual: "rpmResidual", normalized: "normalizedRpmResidual", label: "RPM", decimals: 0 },
  { actual: "egt", expected: "expectedEgt", residual: "egtResidual", normalized: "normalizedEgtResidual", label: "EGT", decimals: 0 },
  { actual: "cht", expected: "expectedCht", residual: "chtResidual", normalized: "normalizedChtResidual", label: "CHT", decimals: 0 },
  { actual: "oilTemperature", expected: "expectedOilTemperature", residual: "oilTemperatureResidual", normalized: "normalizedOilTemperatureResidual", label: "Oil Temp", decimals: 1 },
  { actual: "oilPressure", expected: "expectedOilPressure", residual: "oilPressureResidual", normalized: "normalizedOilPressureResidual", label: "Oil Pressure", decimals: 0 },
  { actual: "fuelFlow", expected: "expectedFuelFlow", residual: "fuelFlowResidual", normalized: "normalizedFuelFlowResidual", label: "Fuel Flow", decimals: 1 },
  { actual: "vibration", expected: "expectedVibration", residual: "vibrationResidual", normalized: "normalizedVibrationResidual", label: "Vibration", decimals: 2 },
];

export default function Diagnostics() {
  const { snapshot, diagnostics } = useAppData();

  if (!snapshot) {
    return (
      <>
        <div className="page-header">
          <span className="eyebrow">Diagnostics</span>
          <h1>Why does the system think something is wrong?</h1>
        </div>
        <div className="panel state-block">
          <span className="headline">Waiting for diagnostics</span>
          {diagnostics.kind === "unavailable" ? diagnostics.body.message : "No snapshot received yet."}
        </div>
      </>
    );
  }

  const { analysis, health, telemetry, physicsPrediction, residuals } = snapshot;
  const probabilities = Object.entries(analysis.faultProbabilities).sort((a, b) => b[1] - a[1]);
  const topFault = probabilities[0];

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">Diagnostics</span>
        <h1>Why does the system think something is wrong?</h1>
        <p>
          The anomaly gate and the fault classifier are independent signals — the classifier reports a probability
          for every tick regardless of whether the conservative anomaly gate has crossed.
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: "var(--space-6)" }}>
        <div className="panel">
          <span className="eyebrow">Current Diagnosis</span>
          <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 600 }}>{humanize(topFault[0])}</span>
            <span className="mono" style={{ color: "var(--text-tertiary)" }}>{(topFault[1] * 100).toFixed(0)}% classifier confidence</span>
          </div>
          <div className="data-row" style={{ marginTop: 12 }}>
            <span className="label">Predicted fault (gated)</span>
            <span className="value">{humanize(analysis.predictedFault)}</span>
          </div>
          <div className="data-row">
            <span className="label">Anomaly gate</span>
            <span className="value">{analysis.anomaly ? "OPEN" : "CLOSED"}</span>
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">Anomaly Score</span>
          <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 600, lineHeight: 1 }}>
            {analysis.anomalyScore.toFixed(3)}
          </div>
          <p className="note" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
            Threshold 0.6124 (95th percentile of healthy training scores) — deliberately conservative, not lowered to
            manufacture detections.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Fault Probability</h2>
        </div>
        <div className="panel">
          {probabilities.map(([fault, prob]) => (
            <Bar
              key={fault}
              label={humanize(fault)}
              value={prob * 100}
              tier={fault === analysis.predictedFault && analysis.anomaly ? "degraded" : "healthy"}
              formatValue={(v) => `${v.toFixed(0)}%`}
            />
          ))}
        </div>
      </div>

      <details className="disclosure section" open={!!analysis.explanation?.explanationAvailable}>
        <summary>Why? (SHAP explanation)</summary>
        <div className="disclosure-body">
          {analysis.explanation?.explanationAvailable ? (
            <>
              {analysis.explanation.topContributors.map((c) => (
                <div className="contrib-item" key={c.feature}>
                  <span className="feature-name">{c.feature}</span>
                  <span className={c.direction === "TOWARD_FAULT" ? "toward" : "away"}>
                    {c.shapValue >= 0 ? "+" : ""}
                    {c.shapValue.toFixed(3)}
                  </span>
                </div>
              ))}
              {analysis.explanation.operatorSummary && (
                <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>{analysis.explanation.operatorSummary}</p>
              )}
            </>
          ) : (
            <p className="note" style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
              No SHAP explanation this tick — only computed when the anomaly gate is actively open.
            </p>
          )}
        </div>
      </details>

      <details className="disclosure section">
        <summary>Physics Residuals</summary>
        <div className="disclosure-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Actual</th>
                <th>Expected</th>
                <th>Residual</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((c) => {
                const residual = residuals[c.residual] as number;
                return (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td>{(telemetry[c.actual] as number).toFixed(c.decimals)}</td>
                    <td>{(physicsPrediction[c.expected] as number).toFixed(c.decimals)}</td>
                    <td className={residual >= 0 ? "pos" : "neg"}>
                      {residual >= 0 ? "+" : ""}
                      {residual.toFixed(c.decimals)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 14 }}>
            <span className="eyebrow">Normalized (fraction of physical operating range)</span>
            <div style={{ marginTop: 8 }}>
              {CHANNELS.map((c) => (
                <DivergeBar key={c.label} label={c.label} value={residuals[c.normalized] as number} limit={0.5} />
              ))}
            </div>
          </div>
        </div>
      </details>

      <details className="disclosure section">
        <summary>Sensor vs Physical Fault Isolation</summary>
        <div className="disclosure-body">
          {health ? (
            <>
              {health.diagnosticType === "SENSOR_FAULT" && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                  Isolated to <b className="mono">{health.affectedSensor}</b> (confidence {(health.diagnosticConfidence * 100).toFixed(0)}%).
                  Related signals remain consistent, so this is treated as an instrumentation issue, not engine damage.
                </p>
              )}
              <div className="sensor-list">
                {Object.entries(health.sensorHealth).map(([sensor, result]) => (
                  <div className="sensor-item" key={sensor}>
                    <span className="name">{sensor}</span>
                    <span className="reason">{result.reason}</span>
                    <StatusPill value={result.status} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="note" style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Sensor isolation unavailable.</p>
          )}
        </div>
      </details>
    </>
  );
}
