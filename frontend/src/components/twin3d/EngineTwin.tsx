import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, GradientTexture, Html, Lightformer, Line, OrbitControls } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HealthResult, Telemetry } from "../../api/types";
import { humanize, statusTier } from "../../lib/status";
import { StatusPill } from "../StatusPill";
import { EngineModel, type EngineVisualState, type SubsystemId } from "./EngineModel";
import { isSynchronized, TwinSyncSequence, useTwinSyncFlags } from "./TwinSyncSequence";

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

type TwinVariant = "compact" | "hero" | "full";

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

function Controls({ autoRotate }: { autoRotate: boolean }) {
  return (
    <OrbitControls
      target={[-0.05, -0.05, 0]}
      enablePan={!autoRotate}
      enableZoom
      minDistance={2.4}
      maxDistance={7}
      maxPolarAngle={Math.PI * 0.62}
      minPolarAngle={Math.PI * 0.18}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
    />
  );
}

/** Small procedural light panels baked once into a local reflection map --
 *  no external HDRI, no network fetch, just enough for believable metal
 *  sheen on the steel/aluminum parts that flat directional lights can't give. */
function ReflectionEnvironment() {
  return (
    <Environment resolution={64} frames={1}>
      <Lightformer form="rect" intensity={2.2} color="#dbe6f2" position={[3, 4, 3]} scale={[5, 5, 1]} rotation={[-Math.PI / 3, Math.PI / 5, 0]} />
      <Lightformer form="rect" intensity={0.9} color="#88a8d8" position={[-4, 1.5, -2]} scale={[4, 4, 1]} rotation={[0, Math.PI / 2.3, 0]} />
      <Lightformer form="ring" intensity={0.6} color="#0d0f12" position={[0, -3, 0]} scale={10} />
    </Environment>
  );
}

interface Callout {
  id: string;
  anchor: [number, number, number];
  label: [number, number, number];
  title: string;
  value: string;
}

function CalloutLayer({ telemetry, activeFault }: { telemetry: Telemetry; activeFault: string }) {
  const callouts: Callout[] = [
    { id: "egt", anchor: [0.4, 1.11, 0], label: [0.85, 1.55, 0.4], title: "EGT", value: `${telemetry.egt.toFixed(0)} °C` },
    { id: "oil", anchor: [0, -0.68, 0.26], label: [-0.55, -1.1, 0.55], title: "Oil Pressure", value: `${telemetry.oilPressure.toFixed(0)} kPa` },
    { id: "rpm", anchor: [1.55, 0.1, 0], label: [2.0, 0.5, 0.4], title: "RPM", value: `${Math.round(telemetry.rpm)}` },
  ];

  return (
    <>
      {callouts.map((c) => (
        <group key={c.id}>
          <mesh position={c.anchor}>
            <sphereGeometry args={[0.014, 8, 8]} />
            <meshBasicMaterial color="#8fb2d9" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <Line points={[c.anchor, c.label]} color="#6f8aab" lineWidth={1} transparent opacity={0.45} />
          <Html position={c.label} center>
            <div className="twin-callout">
              <span className="twin-callout-label">{c.title}</span>
              <span className="twin-callout-value mono">{c.value}</span>
            </div>
          </Html>
        </group>
      ))}
      <Html position={[-0.4, 1.7, 0.35]} center>
        <div className="twin-callout twin-callout-fault" data-active={activeFault !== "NORMAL"}>
          <span className="twin-callout-label">Active Fault</span>
          <span className="twin-callout-value mono">{humanize(activeFault)}</span>
        </div>
      </Html>
    </>
  );
}

export function EngineTwin({
  telemetry,
  health,
  activeFault,
  variant = "full",
}: {
  telemetry: Telemetry | null;
  health: HealthResult | null;
  activeFault: string;
  variant?: TwinVariant;
}) {
  const compact = variant === "compact";
  const showChrome = variant === "full";
  const showCallouts = variant !== "compact";

  const webglOk = useMemo(() => hasWebGL(), []);
  const [selected, setSelected] = useState<SubsystemId | null>(null);
  const [hovered, setHovered] = useState<SubsystemId | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const syncFlags = useTwinSyncFlags();
  const synchronized = isSynchronized(syncFlags);
  const wasSynchronized = useRef(synchronized);
  const [showSyncOverlay, setShowSyncOverlay] = useState(!synchronized);
  const [justSynchronized, setJustSynchronized] = useState(false);

  useEffect(() => {
    if (synchronized && !wasSynchronized.current) {
      wasSynchronized.current = true;
      setJustSynchronized(true);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t = setTimeout(() => setShowSyncOverlay(false), reduced ? 0 : 900);
      return () => clearTimeout(t);
    }
    if (!synchronized) {
      wasSynchronized.current = false;
      setJustSynchronized(false);
      setShowSyncOverlay(true);
    }
  }, [synchronized]);

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
      <div className={`twin-stage ${variant}`}>
        <div className={`twin-canvas ${variant}`}>
          {!webglOk ? (
            <div className="state-block">
              <span className="headline">3D unavailable</span>
              WebGL is not supported in this browser. The rest of the dashboard is unaffected.
            </div>
          ) : (
            <TwinErrorBoundary>
              <Suspense fallback={<div className="state-block">Loading twin…</div>}>
                <Canvas key={resetKey} camera={{ position: [3.25, 2, 4.25], fov: 36 }} dpr={[1, 1.5]} shadows>
                  <color attach="background" args={["#0d0f12"]} />
                  <mesh position={[0, 0.4, -5.2]}>
                    <planeGeometry args={[16, 10]} />
                    <meshBasicMaterial toneMapped={false}>
                      <GradientTexture stops={[0, 1]} colors={["#181c21", "#08090b"]} size={512} />
                    </meshBasicMaterial>
                  </mesh>
                  <ReflectionEnvironment />
                  <hemisphereLight args={["#5b6b80", "#0a0b0d", 0.38]} />
                  {/* Key -- primary form-revealing light, sharp shadow for cylinder/piston depth */}
                  <directionalLight
                    position={[4, 6, 4]}
                    intensity={1.55}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-bias={-0.0004}
                  >
                    <orthographicCamera attach="shadow-camera" args={[-3.5, 3.5, 3.5, -3.5, 0.5, 14]} />
                  </directionalLight>
                  {/* Fill -- soft cool bounce, keeps shadow side legible without flattening it */}
                  <directionalLight position={[-4, 1.6, -2.6]} intensity={0.26} color="#9fbfe8" />
                  {/* Rim -- grazing edge light from behind, separates the silhouette from the backdrop */}
                  <directionalLight position={[-2.4, 2.2, -5.2]} intensity={0.75} color="#cfe0f4" />
                  <EngineModel
                    rpm={rpm}
                    vibration={vibration}
                    visual={visual}
                    onSelect={setSelected}
                    hovered={hovered}
                    setHovered={setHovered}
                  />
                  {showCallouts && telemetry && <CalloutLayer telemetry={telemetry} activeFault={activeFault} />}
                  <ContactShadows position={[0, -1.02, 0]} opacity={0.72} scale={7.5} blur={2.1} far={1.6} resolution={512} color="#000000" />
                  <Controls autoRotate={compact} />
                </Canvas>
              </Suspense>
            </TwinErrorBoundary>
          )}
          {showSyncOverlay && webglOk && (
            <div className="twin-overlay">
              <TwinSyncSequence flags={syncFlags} justSynchronized={justSynchronized} />
            </div>
          )}
        </div>

        {!compact && webglOk && (
          <div className="twin-readout" aria-hidden="true">
            <div className="twin-readout-item">
              <span className="label">RPM</span>
              <span className="value">{telemetry ? Math.round(telemetry.rpm) : "—"}</span>
            </div>
            <div className="twin-readout-item">
              <span className="label">Health</span>
              <span className="value"><StatusPill value={health?.status ?? null} /></span>
            </div>
            <div className="twin-readout-item">
              <span className="label">Active fault</span>
              <span className="value">{humanize(activeFault)}</span>
            </div>
          </div>
        )}

        {!compact && selected && (
          <div className="twin-inspector" role="dialog" aria-label={SUBSYSTEM_INFO[selected].label}>
            <div className="twin-info-head">
              <span className="eyebrow">{SUBSYSTEM_INFO[selected].label}</span>
              <button className="btn btn-ghost" onClick={() => setSelected(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <p>{SUBSYSTEM_INFO[selected].description}</p>
          </div>
        )}
      </div>

      {showChrome && webglOk && (
        <div className="twin-toolbar">
          <span className="eyebrow">Drag to orbit · scroll to zoom · shift-drag to pan</span>
          <button className="btn btn-ghost" onClick={() => setResetKey((k) => k + 1)}>
            Reset view
          </button>
        </div>
      )}

      {showChrome && (
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

      {showChrome && (
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
