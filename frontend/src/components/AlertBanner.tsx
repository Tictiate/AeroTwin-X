import type { DiagnosticsFetchState } from "../hooks/useDiagnostics";
import { humanize, statusTier } from "../lib/status";
import { StatusPill } from "./StatusPill";

export function AlertBanner({ state }: { state: DiagnosticsFetchState }) {
  if (state.kind === "loading") {
    return (
      <div className="alert-banner status-unknown">
        <span className="badge">
          <StatusPill value={null} label="CONNECTING" />
        </span>
        <div className="text">
          <span className="headline">Establishing link to AeroTwin-X backend…</span>
          <span className="detail">Waiting on first response from /api/diagnostics/current.</span>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="alert-banner status-critical">
        <span className="badge">
          <StatusPill value="CRITICAL" label="LINK DOWN" />
        </span>
        <div className="text">
          <span className="headline">Cannot reach the Java backend.</span>
          <span className="detail">{state.message}</span>
        </div>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    const svc =
      state.body.status === "ml-unavailable"
        ? "ML analysis service"
        : state.body.status === "health-unavailable"
          ? "health service"
          : state.body.status === "degradation-unavailable"
            ? "degradation service"
            : "physics service";
    return (
      <div className="alert-banner status-degraded">
        <span className="badge">
          <StatusPill value="DEGRADED" label="SERVICE UNAVAILABLE" />
        </span>
        <div className="text">
          <span className="headline">{svc} is unreachable — showing last known telemetry only.</span>
          <span className="detail">{state.body.message}</span>
        </div>
      </div>
    );
  }

  const { snapshot } = state;
  const health = snapshot.health;
  const rul = snapshot.rul;

  if (!health) {
    return (
      <div className="alert-banner status-unknown">
        <span className="badge">
          <StatusPill value={null} label="AWAITING HEALTH" />
        </span>
        <div className="text">
          <span className="headline">Diagnostics online — health index not yet available.</span>
        </div>
      </div>
    );
  }

  const tier = statusTier(health.status);
  const rulNote =
    rul?.rulHours != null
      ? `Estimated RUL ${rul.rulHours.toFixed(1)}h (${humanize(rul.status)}).`
      : rul
        ? `RUL withheld: ${humanize(rul.status)}.`
        : "";

  const headline =
    health.diagnosticType === "SENSOR_FAULT"
      ? `Sensor fault isolated on ${health.affectedSensor ?? "an unidentified channel"} — physical engine health unaffected.`
      : health.diagnosticType === "PHYSICAL_FAULT"
        ? `Physical fault indicators active${health.faultType ? `: ${humanize(health.faultType)}` : ""}.`
        : health.status === "HEALTHY"
          ? `Engine nominal — overall health ${health.overallHealth.toFixed(1)} (${humanize(health.status)}).`
          : `Overall health ${health.overallHealth.toFixed(1)} (${humanize(health.status)}) — no corroborated fault diagnosis yet.`;

  return (
    <div className={`alert-banner status-${tier}`}>
      <span className="badge">
        <StatusPill value={health.status} />
      </span>
      <div className="text">
        <span className="headline">{headline}</span>
        <span className="detail">{rulNote}</span>
      </div>
    </div>
  );
}
