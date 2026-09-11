import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { api } from "../api/client";
import type { HealthResult, Telemetry } from "../api/types";
import { humanize, statusTier } from "../lib/status";
import { StatusPill } from "./StatusPill";

const FAULT_POLL_MS = 4000;

// Mirrors --status-* in styles/index.css -- kept in sync manually since Three.js
// materials need JS color values, not CSS custom properties.
const TIER_COLOR: Record<string, string> = {
  healthy: "#35d68f",
  caution: "#e8c435",
  degraded: "#e89135",
  critical: "#e8455c",
  unknown: "#4d5f70",
};

const NEUTRAL_METAL = "#5a6b7a";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

interface EngineSceneProps {
  rpm: number;
  healthColor: string;
  fault: string;
  vibration: number;
  thermalStress: number; // 0..1, drives the thermal glow tint
  oilPressureStress: number; // 0..1, continuous modulation of the lubrication ring independent of fault state
}

function EngineScene({ rpm, healthColor, fault, vibration, thermalStress, oilPressureStress }: EngineSceneProps) {
  const crankshaft = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const clockRef = useRef(0);

  const cylinderAngles = useMemo(() => [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2], []);

  useFrame((_, delta) => {
    clockRef.current += delta;
    // RPM -> visible rotation speed. Scaled down heavily (this is a legibility aid, not a
    // literal 1:1 RPM simulation) so the crankshaft reads as "spinning faster/slower", not a blur.
    const radiansPerSecond = (rpm / 4550) * 6;
    if (crankshaft.current) {
      crankshaft.current.rotation.z += radiansPerSecond * delta;
    }
    if (rig.current) {
      // Subtle vibration jitter, capped so it stays a legibility cue, never a violent shake.
      const jitter = Math.min(vibration, 20) / 20;
      rig.current.position.x = Math.sin(clockRef.current * 40) * jitter * 0.03;
      rig.current.position.y = Math.cos(clockRef.current * 47) * jitter * 0.02;
    }
  });

  const injectorActive = fault === "INJECTOR_DEGRADATION";
  const misfireActive = fault === "MISFIRE";
  const lubricationActive = fault === "LUBRICATION_DEGRADATION";
  const sensorActive = fault === "SENSOR_DRIFT";

  const cylinderColor = misfireActive ? TIER_COLOR.critical : NEUTRAL_METAL;
  const injectorColor = injectorActive ? TIER_COLOR.degraded : "#7d92a3";
  const lubricationColor = lubricationActive ? TIER_COLOR.critical : "#2a9dc4";
  const sensorColor = sensorActive ? TIER_COLOR.caution : "#3a4a58";

  const thermalTint = new THREE.Color().lerpColors(
    new THREE.Color(NEUTRAL_METAL),
    new THREE.Color("#e8455c"),
    Math.max(0, Math.min(1, thermalStress)),
  );

  return (
    <group ref={rig}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <directionalLight position={[-4, -2, -3]} intensity={0.3} />

      {/* Crankshaft */}
      <group ref={crankshaft}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 2.6, 20]} />
          <meshStandardMaterial color={healthColor} metalness={0.6} roughness={0.35} />
        </mesh>
        {/* Counterweights, purely to make rotation visually legible */}
        <mesh position={[0.9, 0, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.12]} />
          <meshStandardMaterial color={healthColor} metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[-0.9, 0, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.12]} />
          <meshStandardMaterial color={healthColor} metalness={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* Cylinder block (combustion region) -- represented at subsystem level, not per-cylinder,
          since the backend never identifies an exact cylinder. */}
      {cylinderAngles.map((angle, i) => {
        const x = Math.cos(angle) * 1.15;
        const y = Math.sin(angle) * 1.15;
        return (
          <group key={i} position={[x, y, 0]} rotation={[0, 0, angle]}>
            <mesh position={[0, 0.55, 0]}>
              <boxGeometry args={[0.4, 1.1, 0.4]} />
              <meshStandardMaterial color={cylinderColor} emissive={thermalTint} emissiveIntensity={0.35} metalness={0.4} roughness={0.5} />
            </mesh>
            {/* Injector, mounted on top of the cylinder */}
            <mesh position={[0, 1.2, 0]}>
              <cylinderGeometry args={[0.08, 0.1, 0.3, 10]} />
              <meshStandardMaterial color={injectorColor} metalness={0.3} roughness={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* Lubrication ring around the crankcase base -- discrete red when the fault is active,
          plus a continuous, subtler glow that tracks real oil pressure even when it isn't. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.06, 12, 48]} />
        <meshStandardMaterial
          color={lubricationColor}
          metalness={0.2}
          roughness={0.5}
          emissive={lubricationColor}
          emissiveIntensity={lubricationActive ? 0.6 : 0.1 + oilPressureStress * 0.35}
        />
      </mesh>

      {/* Sensor indicator */}
      <mesh position={[1.9, 1.4, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={sensorColor} emissive={sensorColor} emissiveIntensity={sensorActive ? 0.9 : 0.15} />
      </mesh>
    </group>
  );
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
      return <p className="panel-empty">3D visualization unavailable in this browser (rendering error).</p>;
    }
    return this.props.children;
  }
}

export function LiveDigitalTwin3D({
  telemetry,
  health,
  wsStatus,
}: {
  telemetry: Telemetry | null;
  health: HealthResult | null;
  wsStatus: string;
}) {
  const webglOk = useMemo(() => hasWebGL(), []);

  // The 3D highlight follows which fault is actually active in the live simulator (the same
  // ground-truth value the Live Simulator Fault Control panel shows), not the classifier's raw
  // probability -- at a true NORMAL baseline the classifier's top class is often just noise
  // between near-equal probabilities, which would light up a "fault" region for nothing wrong.
  const [fault, setFault] = useState("NORMAL");
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getSimulatorFault()
        .then((state) => {
          if (!cancelled) setFault(state.faultType);
        })
        .catch(() => {
          /* transient fetch failure -- keep showing the last known fault state */
        });
    };
    poll();
    const interval = setInterval(poll, FAULT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const healthColor = TIER_COLOR[statusTier(health?.status ?? null)] ?? NEUTRAL_METAL;
  const rpm = telemetry?.rpm ?? 0;
  const vibration = telemetry?.vibration ?? 0;

  // Thermal stress from real CHT/EGT vs. their physics-expected values would require the
  // residual object; this panel only receives telemetry, so it uses CHT's absolute level
  // against a generous prototype reference band as a restrained visual cue, not a diagnosis.
  // This engine's normal healthy CHT runs ~230-260C, so the band starts above that range --
  // NORMAL should read visually clean, not already "warm."
  const thermalStress = telemetry ? Math.max(0, Math.min(1, (telemetry.cht - 280) / 150)) : 0;
  const oilPressureStress = telemetry ? Math.max(0, Math.min(1, (400 - telemetry.oilPressure) / 150)) : 0;

  return (
    <section className="panel twin3d-panel">
      <div className="panel-title">
        <h2>Live Digital Twin</h2>
        <span className={`pill status-${wsStatus === "open" ? "healthy" : "unknown"}`}>
          {wsStatus === "open" ? "LIVE" : humanize(wsStatus)}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: -6, marginBottom: 10 }}>
        Real-time 3D visualization of computational twin state — not a CFD simulation, not a claim of physical
        geometry accuracy. Every value below is read directly from the same live telemetry and diagnosis already
        shown elsewhere on this dashboard.
      </p>

      <div className="twin3d-stats">
        <span>
          RPM <b>{telemetry ? Math.round(rpm) : "—"}</b>
        </span>
        <span>
          Health <StatusPill value={health?.status ?? null} />
        </span>
        <span>
          Active fault <b>{humanize(fault)}</b>
        </span>
      </div>

      <div className="twin3d-canvas-wrap">
        {!webglOk ? (
          <p className="panel-empty">WebGL is not available in this browser — 3D visualization disabled. The rest of the dashboard is unaffected.</p>
        ) : (
          <TwinErrorBoundary>
            <Suspense fallback={<p className="panel-empty">Loading 3D twin…</p>}>
              <Canvas camera={{ position: [3.2, 2.4, 3.2], fov: 42 }} dpr={[1, 1.5]}>
                <EngineScene
                  rpm={rpm}
                  healthColor={healthColor}
                  fault={fault}
                  vibration={vibration}
                  thermalStress={thermalStress}
                  oilPressureStress={oilPressureStress}
                />
              </Canvas>
            </Suspense>
          </TwinErrorBoundary>
        )}
        {!telemetry && (
          <p className="panel-empty" style={{ position: "absolute", inset: 0, margin: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Waiting for telemetry…
          </p>
        )}
      </div>

      <div className="twin3d-legend">
        <span><i className="twin3d-swatch" style={{ background: NEUTRAL_METAL }} /> Crankshaft — color follows overall health band; spin speed follows RPM; subtle jitter follows vibration</span>
        <span><i className="twin3d-swatch" style={{ background: TIER_COLOR.critical }} /> Cylinder block — reddens while Misfire is the active fault; warms toward CHT's real level otherwise</span>
        <span><i className="twin3d-swatch" style={{ background: TIER_COLOR.degraded }} /> Injector — ambers while Injector Degradation is the active fault</span>
        <span><i className="twin3d-swatch" style={{ background: "#2a9dc4" }} /> Lubrication ring — reddens while Lubrication Degradation is the active fault; glows amber continuously as real oil pressure drops, even without a confirmed fault</span>
        <span><i className="twin3d-swatch" style={{ background: TIER_COLOR.caution }} /> Sensor indicator — lights while Sensor Drift is the active fault</span>
      </div>
      <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
        "Active fault" reflects the live simulator's own fault-control state (the same value shown in the Live
        Simulator Fault Control panel above), not a diagnosis — the AI Diagnosis panel's classifier and anomaly gate
        remain the source of truth for what the system has actually detected. The lubrication ring, cylinder blocks,
        and injectors represent the corresponding subsystem generally; the backend does not identify an exact
        cylinder.
      </p>
    </section>
  );
}
