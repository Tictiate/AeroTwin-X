import { useAppData } from "../context/AppDataContext";
import { EngineTwin } from "../components/twin3d/EngineTwin";

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

      <EngineTwin telemetry={effectiveTelemetry} health={health} activeFault={simulatorFault?.faultType ?? "NORMAL"} />
    </>
  );
}
