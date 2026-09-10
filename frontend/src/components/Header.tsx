import type { WsStatus } from "../hooks/useTelemetryStream";
import type { Telemetry } from "../api/types";

export function Header({ telemetry, wsStatus }: { telemetry: Telemetry | null; wsStatus: WsStatus }) {
  return (
    <header className="header">
      <div className="header-title">
        <h1>AeroTwin-X</h1>
        <span className="subtitle">Propulsion Health &amp; Mission Reliability Console</span>
      </div>
      <div className="header-meta">
        <span>
          <span className={`conn-dot ${wsStatus}`} />
          Telemetry link: <strong>{wsStatus}</strong>
        </span>
        <span>
          Engine: <strong>{telemetry?.engineId ?? "—"}</strong>
        </span>
        <span>
          Mission: <strong>{telemetry?.missionId ?? "—"}</strong>
        </span>
        <span>
          Phase: <strong>{telemetry?.missionPhase ?? "—"}</strong>
        </span>
      </div>
    </header>
  );
}
