import type { DegradationState, HealthResult, MLAnalysis, RulEstimate } from "../api/types";
import { humanize } from "../lib/status";
import { StatusPill } from "./StatusPill";

/**
 * Synthesizes an operator-facing maintenance advisory purely from fields the backend already
 * computes (health.diagnosticType/faultType/affectedSensor/contributors, degradation.dominantMechanism/trend,
 * analysis.faultProbabilities). This is NOT a second decision engine: every branch below reads an
 * existing classification the backend already made (diagnosticType, health status band, degradation
 * trend) and turns it into a sentence -- it never computes a new score or threshold, and it never
 * touches the mission-risk vocabulary (MISSION_GO/CAUTION/AT_RISK/HIGH_RISK), so it cannot contradict
 * the Mission Simulation panel's recommendation.
 */
interface Advisory {
  subsystem: string;
  why: string;
  action: string;
}

const FAULT_ACTIONS: Record<string, string> = {
  LUBRICATION_DEGRADATION: "Inspect lubrication system before next mission.",
  INJECTOR_DEGRADATION: "Inspect fuel injection system before next mission.",
  MISFIRE: "Inspect ignition/combustion system before next mission.",
  SENSOR_DRIFT: "Verify affected sensor calibration; physical engine health is not indicated as affected.",
};

function deriveAdvisory(health: HealthResult, degradation: DegradationState | null, analysis: MLAnalysis): Advisory {
  if (health.diagnosticType === "PHYSICAL_FAULT" && health.faultType) {
    const confidence = analysis.faultProbabilities[analysis.predictedFault];
    return {
      subsystem: humanize(health.faultType),
      why:
        `Classifier confidence ${(confidence * 100).toFixed(0)}% for ${humanize(analysis.predictedFault)}` +
        ` · diagnostic confidence ${(health.diagnosticConfidence * 100).toFixed(0)}%.`,
      action: FAULT_ACTIONS[health.faultType] ?? `Inspect subsystem associated with ${humanize(health.faultType)} before next mission.`,
    };
  }

  if (health.diagnosticType === "SENSOR_FAULT" && health.affectedSensor) {
    const sensorReason = health.sensorHealth[health.affectedSensor]?.reason ?? "Persistent residual deviation isolated to this sensor.";
    return {
      subsystem: `${humanize(health.affectedSensor)} sensor`,
      why: sensorReason,
      action: FAULT_ACTIONS.SENSOR_DRIFT,
    };
  }

  if (health.status === "HEALTHY") {
    return {
      subsystem: "None",
      why: "All monitored subsystems are within nominal residual bounds.",
      action: "No immediate maintenance action indicated.",
    };
  }

  // Health is degraded but the anomaly gate hasn't corroborated a specific physical fault yet
  // (e.g. Injector Degradation before the conservative gate crosses) -- stay honest, don't guess.
  const topContributor = health.contributors[0]?.factor;
  if (health.status === "CRITICAL") {
    return {
      subsystem: topContributor ?? (degradation?.dominantMechanism ? humanize(degradation.dominantMechanism) : "Unspecified"),
      why: degradation
        ? `${humanize(degradation.dominantMechanism)} is the dominant degradation mechanism, trending ${degradation.trend.toLowerCase()}.`
        : "Health index has dropped into the critical band.",
      action: "Ground the engine and inspect before further flight.",
    };
  }
  return {
    subsystem: topContributor ?? (degradation?.dominantMechanism ? humanize(degradation.dominantMechanism) : "Unspecified"),
    why: degradation
      ? `${humanize(degradation.dominantMechanism)} is the dominant degradation mechanism, trending ${degradation.trend.toLowerCase()}. No corroborated physical fault diagnosis yet.`
      : "Overall health has moved outside the healthy band; no corroborated physical fault diagnosis yet.",
    action: `Monitor ${degradation ? humanize(degradation.dominantMechanism).toLowerCase() : "affected subsystem"} trend; re-evaluate before next mission.`,
  };
}

export function MaintenanceAdvisoryPanel({
  health,
  degradation,
  rul,
  analysis,
}: {
  health: HealthResult | null;
  degradation: DegradationState | null;
  rul: RulEstimate | null;
  analysis: MLAnalysis | null;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Maintenance Advisory</h2>
        <StatusPill value={health?.status ?? null} />
      </div>

      {!health || !analysis ? (
        <p className="panel-empty">Waiting for a full diagnostics snapshot…</p>
      ) : (
        <>
          {(() => {
            const advisory = deriveAdvisory(health, degradation, analysis);
            return (
              <>
                <div className="stat-line">
                  <span className="k">Requires attention</span>
                  <span>{advisory.subsystem}</span>
                </div>
                <p className="interpretation" style={{ marginTop: 4 }}>
                  {advisory.why}
                </p>
                <div className="stat-line" style={{ marginTop: 8 }}>
                  <span className="k">Recommended action</span>
                </div>
                <p className="interpretation" style={{ fontWeight: 600, color: "var(--text)" }}>{advisory.action}</p>
              </>
            );
          })()}

          <div className="stat-line" style={{ marginTop: 10, borderTop: "1px dashed var(--border-soft)", paddingTop: 8 }}>
            <span className="k">RUL reliability</span>
            <StatusPill value={rul?.status ?? null} />
          </div>
          <p className="interpretation">
            {rul === null
              ? "RUL unavailable — diagnostics not yet loaded."
              : rul.rulHours !== null
                ? `Estimated ${rul.rulHours.toFixed(1)}h remaining (confidence ${(rul.confidence * 100).toFixed(0)}%).`
                : rul.explanation}
          </p>

          <p style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 10 }}>
            Prototype engineering advisory, not a certified maintenance determination and not an autonomous
            maintenance authorization. Derived entirely from the health, degradation, RUL, and diagnosis figures
            shown elsewhere on this dashboard.
          </p>
        </>
      )}
    </section>
  );
}
