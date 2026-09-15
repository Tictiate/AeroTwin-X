import { useAppData } from "../context/AppDataContext";
import { Bar } from "../components/Bar";
import { StatusPill } from "../components/StatusPill";
import { ActualVsExpected } from "../components/ActualVsExpected";
import { humanize, statusTier } from "../lib/status";

const ANOMALY_THRESHOLD = 0.6124;
const GAUGE_MAX = 1.05;

export default function Diagnostics() {
  const { snapshot, snapshotHistory, diagnostics } = useAppData();

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

  const { analysis, health } = snapshot;
  const probabilities = Object.entries(analysis.faultProbabilities).sort((a, b) => b[1] - a[1]);
  const topFault = probabilities[0];
  const gateOpen = analysis.anomaly;
  const headline = gateOpen ? humanize(analysis.predictedFault) : "No Confirmed Fault";

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

      <div className="panel diagnosis-block" style={{ marginBottom: "var(--space-6)" }}>
        <div className="diagnosis-block-main">
          <span className="eyebrow">Current System State</span>
          <div style={{ marginTop: 10 }}>
            <span
              style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 600 }}
              data-tier={gateOpen ? "degraded" : "healthy"}
            >
              {headline}
            </span>
          </div>
          <div className="data-row" style={{ marginTop: 12 }}>
            <span className="label">Top classifier signal</span>
            <span className="value">
              {humanize(topFault[0])} · {(topFault[1] * 100).toFixed(0)}%
            </span>
          </div>
          <div className="data-row">
            <span className="label">Anomaly gate</span>
            <span className="value">{gateOpen ? "OPEN" : "CLOSED"}</span>
          </div>
        </div>

        <div className="diagnosis-block-gauge">
          <div className="gauge-readout">
            <span className="eyebrow">Anomaly Score</span>
            <span className="gauge-threshold-label">
              Threshold <b className="mono">{ANOMALY_THRESHOLD}</b>
            </span>
          </div>
          <div className="gauge-score mono" data-tier={analysis.anomaly ? "degraded" : "healthy"}>
            {analysis.anomalyScore.toFixed(3)}
          </div>
          <div className="gauge-track">
            <div className="gauge-zone-warn" style={{ left: `${(ANOMALY_THRESHOLD / GAUGE_MAX) * 100}%` }} />
            <div className="gauge-threshold-tick" style={{ left: `${(ANOMALY_THRESHOLD / GAUGE_MAX) * 100}%` }} />
            <div
              className={`gauge-marker ${analysis.anomaly ? "open" : ""}`}
              style={{ left: `${Math.min(100, (analysis.anomalyScore / GAUGE_MAX) * 100)}%` }}
            />
          </div>
          <p className="note" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
            95th percentile of healthy training scores — deliberately conservative, not lowered to manufacture
            detections.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Fault Probability</h2>
        </div>
        <div className="panel">
          {probabilities.map(([fault, prob], i) => (
            <div key={fault} className={i === 0 ? "fault-prob-lead" : "fault-prob-rest"}>
              <Bar
                label={humanize(fault)}
                value={prob * 100}
                tier={fault === analysis.predictedFault && analysis.anomaly ? "degraded" : "healthy"}
                formatValue={(v) => `${v.toFixed(0)}%`}
              />
            </div>
          ))}
        </div>
      </div>

      <details className="disclosure section" open={!!analysis.explanation?.explanationAvailable}>
        <summary>Why? (SHAP explanation)</summary>
        <div className="disclosure-body">
          {analysis.explanation?.explanationAvailable ? (
            <>
              {(() => {
                const maxAbsShap = Math.max(
                  ...analysis.explanation.topContributors.map((c) => Math.abs(c.shapValue)),
                  0.0001
                );
                return analysis.explanation.topContributors.map((c) => (
                  <div className="contrib-item" key={c.feature}>
                    <span className="feature-name">{c.feature}</span>
                    <div className="diverge-track">
                      <div
                        className={`diverge-fill ${c.shapValue >= 0 ? "pos" : "neg"}`}
                        style={{ width: `${(Math.min(1, Math.abs(c.shapValue) / maxAbsShap) * 50).toFixed(1)}%` }}
                      />
                    </div>
                    <span className={c.direction === "TOWARD_FAULT" ? "toward" : "away"}>
                      {c.shapValue >= 0 ? "+" : ""}
                      {c.shapValue.toFixed(3)}
                    </span>
                  </div>
                ));
              })()}
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
        <summary>Physics Residuals — Actual vs Expected</summary>
        <div className="disclosure-body">
          <ActualVsExpected history={snapshotHistory} />
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
