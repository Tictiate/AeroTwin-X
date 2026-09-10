import type { MLAnalysis } from "../api/types";
import { humanize } from "../lib/status";
import { Bar } from "./Bar";
import { StatusPill } from "./StatusPill";

export function DiagnosisPanel({ analysis }: { analysis: MLAnalysis }) {
  const probabilities = Object.entries(analysis.faultProbabilities).sort((a, b) => b[1] - a[1]);

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>AI Diagnosis</h2>
        <StatusPill value={analysis.anomaly ? "DEGRADED" : "HEALTHY"} label={analysis.anomaly ? "ANOMALY" : "NOMINAL"} />
      </div>

      <div className="stat-line">
        <span className="k">Anomaly score</span>
        <span>{analysis.anomalyScore.toFixed(3)}</span>
      </div>
      <div className="stat-line">
        <span className="k">Predicted fault</span>
        <span>{humanize(analysis.predictedFault)}</span>
      </div>
      <div className="stat-line">
        <span className="k">Model version</span>
        <span>{analysis.modelVersion}</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="panel-title" style={{ marginBottom: 6 }}>
          <h2 style={{ fontSize: 10.5 }}>Fault probability</h2>
        </div>
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

      {analysis.explanation?.explanationAvailable ? (
        <div style={{ marginTop: 12 }}>
          <div className="panel-title" style={{ marginBottom: 6 }}>
            <h2 style={{ fontSize: 10.5 }}>SHAP — top contributing features</h2>
          </div>
          <div className="contrib-list">
            {analysis.explanation.topContributors.map((c) => (
              <div className="contrib-item" key={c.feature}>
                <div className="feature-row">
                  <span className="feature-name">{c.feature}</span>
                  <span className={c.direction === "TOWARD_FAULT" ? "direction-toward" : "direction-away"}>
                    {c.shapValue >= 0 ? "+" : ""}
                    {c.shapValue.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {analysis.explanation.operatorSummary && (
            <p className="interpretation">{analysis.explanation.operatorSummary}</p>
          )}
        </div>
      ) : (
        <p className="panel-empty" style={{ marginTop: 8 }}>
          No SHAP explanation this tick — only computed when an anomaly is actively flagged.
        </p>
      )}
    </section>
  );
}
