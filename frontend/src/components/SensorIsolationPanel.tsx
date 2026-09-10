import type { HealthResult } from "../api/types";
import { StatusPill } from "./StatusPill";

export function SensorIsolationPanel({ health }: { health: HealthResult | null }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Sensor vs Physical Fault Isolation</h2>
        {health && <StatusPill value={health.diagnosticType} />}
      </div>

      {!health ? (
        <p className="panel-empty">Sensor isolation unavailable.</p>
      ) : (
        <>
          {health.diagnosticType === "SENSOR_FAULT" && (
            <p className="interpretation" style={{ marginTop: 0, marginBottom: 12 }}>
              Isolated to <strong>{health.affectedSensor}</strong> (confidence{" "}
              {(health.diagnosticConfidence * 100).toFixed(0)}%). Related signals remain consistent, so this is
              treated as an instrumentation issue, not engine damage.
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
      )}
    </section>
  );
}
