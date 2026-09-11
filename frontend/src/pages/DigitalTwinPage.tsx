import { useAppData } from "../context/AppDataContext";
import { EngineTwin } from "../components/twin3d/EngineTwin";
import { humanize } from "../lib/status";
import { StatusPill } from "../components/StatusPill";

export default function DigitalTwinPage() {
  const { snapshot, effectiveTelemetry, simulatorFault } = useAppData();
  const health = snapshot?.health ?? null;

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">Digital Twin</span>
        <h1>What is the engine doing physically right now?</h1>
        <p>
          A stylized, mechanically coherent inline 4-cylinder model bound to the same live telemetry and diagnosis
          shown throughout the dashboard.
        </p>
      </div>

      <div className="grid-3" style={{ marginBottom: "var(--space-5)" }}>
        <div className="panel">
          <div className="data-row"><span className="label">RPM</span><span className="value">{effectiveTelemetry ? Math.round(effectiveTelemetry.rpm) : "—"}</span></div>
        </div>
        <div className="panel">
          <div className="data-row"><span className="label">Health</span><span className="value"><StatusPill value={health?.status ?? null} /></span></div>
        </div>
        <div className="panel">
          <div className="data-row"><span className="label">Active fault</span><span className="value">{humanize(simulatorFault?.faultType ?? null)}</span></div>
        </div>
      </div>

      <div className="panel">
        <EngineTwin telemetry={effectiveTelemetry} health={health} activeFault={simulatorFault?.faultType ?? "NORMAL"} />
      </div>
    </>
  );
}
