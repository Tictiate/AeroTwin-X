import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Component, Suspense, useMemo, useState, type ReactNode } from "react";
import type { HealthResult, Telemetry } from "../../api/types";
import { humanize, statusTier } from "../../lib/status";
import { EngineModel, type EngineVisualState, type SubsystemId } from "./EngineModel";

const TIER_COLOR: Record<string, string> = {
  healthy: "#52b788",
  caution: "#d9a949",
  degraded: "#d97359",
  critical: "#d97359",
  unknown: "#63676d",
};
const NEUTRAL = "#8a8d92";

const SUBSYSTEM_INFO: Record<SubsystemId, { label: string; description: string }> = {
  crankshaft: {
    label: "Crankshaft",
    description: "Rotation speed follows live RPM. Color follows the overall health band.",
  },
  cylinders: {
    label: "Cylinders",
    description:
      "Represented at the subsystem level -- the backend does not identify an exact cylinder. Tints toward the critical color while Misfire is the engine's active fault; otherwise reflects CHT's real level.",
  },
  injectors: {
    label: "Injectors",
    description: "Tints toward the caution color while Injector Degradation is the engine's active fault.",
  },
  lubrication: {
    label: "Lubrication (oil sump)",
    description:
      "Glows in proportion to real oil pressure continuously, and tints toward the critical color while Lubrication Degradation is the engine's active fault.",
  },
  sensor: {
    label: "Sensor node",
    description:
      "Lights while Sensor Drift is the engine's active fault. Never implies mechanical damage -- a lit sensor node means a measurement is suspect, not that a part is failing.",
  },
};

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

class TwinErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <div className="state-block critical"><span className="headline">3D unavailable</span>Rendering error in this browser -- the rest of the dashboard is unaffected.</div>;
    }
    return this.props.children;
  }
}

function Controls({ compact }: { compact: boolean }) {
  return (
    <>
      <OrbitControls
        enablePan={!compact}
        enableZoom
        minDistance={2.4}
        maxDistance={7}
        maxPolarAngle={Math.PI * 0.62}
        minPolarAngle={Math.PI * 0.18}
        autoRotate={compact}
        autoRotateSpeed={0.6}
      />
    </>
  );
}

export function EngineTwin({
  telemetry,
  health,
  activeFault,
  compact = false,
}: {
  telemetry: Telemetry | null;
  health: HealthResult | null;
  activeFault: string;
  compact?: boolean;
}) {
  const webglOk = useMemo(() => hasWebGL(), []);
  const [selected, setSelected] = useState<SubsystemId | null>(null);
  const [hovered, setHovered] = useState<SubsystemId | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const healthColor = TIER_COLOR[statusTier(health?.status ?? null)] ?? NEUTRAL;
  const rpm = telemetry?.rpm ?? 0;
  const vibration = telemetry?.vibration ?? 0;
  const thermalGlow = telemetry ? Math.max(0, Math.min(1, (telemetry.cht - 280) / 150)) : 0;
  const oilGlow = telemetry ? Math.max(0, Math.min(1, (400 - telemetry.oilPressure) / 150)) : 0;

  const visual: EngineVisualState = {
    healthColor,
    cylinderColor: activeFault === "MISFIRE" ? TIER_COLOR.critical : NEUTRAL,
    injectorColor: activeFault === "INJECTOR_DEGRADATION" ? TIER_COLOR.caution : "#6b6e73",
    lubricationColor: activeFault === "LUBRICATION_DEGRADATION" ? TIER_COLOR.critical : "#3f79a3",
    sensorColor: activeFault === "SENSOR_DRIFT" ? TIER_COLOR.caution : "#3a3d41",
    thermalGlow,
    oilGlow,
  };

  return (
    <div>
      <div className={`twin-canvas ${compact ? "compact" : ""}`}>
        {!webglOk ? (
          <div className="state-block">
            <span className="headline">3D unavailable</span>
            WebGL is not supported in this browser. The rest of the dashboard is unaffected.
          </div>
        ) : (
          <TwinErrorBoundary>
            <Suspense fallback={<div className="state-block">Loading twin…</div>}>
              <Canvas key={resetKey} camera={{ position: [3.4, 2.2, 4.2], fov: 40 }} dpr={[1, 1.5]}>
                <color attach="background" args={["#101214"]} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[4, 6, 5]} intensity={1.15} />
                <directionalLight position={[-3, -1, -4]} intensity={0.25} />
                <EngineModel
                  rpm={rpm}
                  vibration={vibration}
                  visual={visual}
                  onSelect={setSelected}
                  hovered={hovered}
                  setHovered={setHovered}
                />
                {!compact && <Controls compact={false} />}
                {compact && <Controls compact />}
              </Canvas>
            </Suspense>
          </TwinErrorBoundary>
        )}
        {!telemetry && webglOk && (
          <div className="twin-overlay">
            <div className="state-block">Waiting for telemetry…</div>
          </div>
        )}
      </div>

      {!compact && webglOk && (
        <div className="twin-toolbar">
          <span className="eyebrow">Drag to orbit · scroll to zoom · shift-drag to pan</span>
          <button className="btn btn-ghost" onClick={() => setResetKey((k) => k + 1)}>
            Reset view
          </button>
        </div>
      )}

      {!compact && (
        <div className="twin-legend">
          {(Object.keys(SUBSYSTEM_INFO) as SubsystemId[]).map((id) => (
            <button
              key={id}
              className={`twin-legend-item ${selected === id ? "active" : ""}`}
              onClick={() => setSelected(selected === id ? null : id)}
            >
              {SUBSYSTEM_INFO[id].label}
            </button>
          ))}
        </div>
      )}

      {!compact && selected && (
        <div className="twin-info panel">
          <div className="twin-info-head">
            <span className="eyebrow">{SUBSYSTEM_INFO[selected].label}</span>
            <button className="btn btn-ghost" onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <p>{SUBSYSTEM_INFO[selected].description}</p>
        </div>
      )}

      {!compact && (
        <p className="twin-disclaimer">
          Real-time 3D visualization of computational twin state — not a CFD simulation, not a claim of physical
          geometry accuracy. "Active fault" reflects the live simulator's own fault-control state, not a diagnosis —
          the Diagnostics page's classifier and anomaly gate remain the source of truth for what the system has
          actually detected.
        </p>
      )}
    </div>
  );
}
