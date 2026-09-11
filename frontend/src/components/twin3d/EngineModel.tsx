import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * A stylized but mechanically coherent inline 4-cylinder engine: real slider-crank
 * kinematics drive piston/rod motion from a single rotating crankshaft angle, not
 * independent arbitrary animation. Geometry is intentionally simplified (low
 * segment-count primitives, no textures) -- a technical cutaway illustration, not a
 * CAD model.
 */

const CRANK_RADIUS = 0.28;
const ROD_LENGTH = 0.85;
const CYL_XS = [-1.2, -0.4, 0.4, 1.2];
const CYL_BASE_Y = 0.95;
const HOUSING_COLOR = "#5b5e63";
const METAL = { metalness: 0.55, roughness: 0.4 };

export type SubsystemId = "crankshaft" | "cylinders" | "injectors" | "lubrication" | "sensor";

export interface EngineVisualState {
  healthColor: string;
  cylinderColor: string; // combustion region tint (Misfire)
  injectorColor: string; // fuel/injector tint (Injector Degradation)
  lubricationColor: string; // oil ring/sump tint (Lubrication Degradation)
  sensorColor: string; // sensor node tint (Sensor Drift)
  thermalGlow: number; // 0..1, subtle emissive on cylinder heads (CHT-driven)
  oilGlow: number; // 0..1, subtle emissive on the sump (oil-pressure-driven)
}

function sliderCrankPiston(theta: number): { pistonY: number; pinY: number; pinZ: number } {
  const pinY = CRANK_RADIUS * Math.cos(theta);
  const pinZ = CRANK_RADIUS * Math.sin(theta);
  const pistonY = pinY + Math.sqrt(Math.max(0, ROD_LENGTH * ROD_LENGTH - pinZ * pinZ));
  return { pistonY, pinY, pinZ };
}

interface CylinderUnitProps {
  x: number;
  phase: number;
  angleRef: { current: number };
  visual: EngineVisualState;
  onSelect: (id: SubsystemId) => void;
  hovered: SubsystemId | null;
  setHovered: (id: SubsystemId | null) => void;
}

function CylinderUnit({ x, phase, angleRef, visual, onSelect, hovered, setHovered }: CylinderUnitProps) {
  const piston = useRef<THREE.Mesh>(null);
  const rod = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const theta = angleRef.current + phase;
    const { pistonY, pinY, pinZ } = sliderCrankPiston(theta);
    const finalPistonY = CYL_BASE_Y + (pistonY - ROD_LENGTH);

    if (piston.current) {
      piston.current.position.set(x, finalPistonY, 0);
    }
    if (rod.current) {
      const crankPinLocalY = CYL_BASE_Y - ROD_LENGTH + pinY;
      const midY = (crankPinLocalY + finalPistonY) / 2;
      const midZ = pinZ / 2;
      rod.current.position.set(x, midY, midZ);
      const dy = finalPistonY - crankPinLocalY;
      const dz = 0 - pinZ;
      rod.current.rotation.x = Math.atan2(dz, dy);
    }
  });

  const isHovered = hovered === "cylinders";

  return (
    <group>
      {/* Cylinder block */}
      <mesh position={[x, 0.55, 0]}>
        <boxGeometry args={[0.42, 0.9, 0.42]} />
        <meshStandardMaterial color={visual.cylinderColor} {...METAL} />
      </mesh>
      {/* Cylinder head */}
      <mesh
        position={[x, 1.08, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered("cylinders");
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect("cylinders");
        }}
      >
        <boxGeometry args={[0.5, 0.18, 0.5]} />
        <meshStandardMaterial
          color={visual.cylinderColor}
          emissive={visual.cylinderColor}
          emissiveIntensity={0.25 + visual.thermalGlow * 0.5 + (isHovered ? 0.25 : 0)}
          {...METAL}
        />
      </mesh>
      {/* Injector */}
      <mesh
        position={[x, 1.32, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered("injectors");
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect("injectors");
        }}
      >
        <cylinderGeometry args={[0.05, 0.06, 0.28, 12]} />
        <meshStandardMaterial
          color={visual.injectorColor}
          emissive={visual.injectorColor}
          emissiveIntensity={hovered === "injectors" ? 0.5 : 0.15}
          {...METAL}
        />
      </mesh>
      {/* Piston (real slider-crank position) */}
      <mesh ref={piston}>
        <cylinderGeometry args={[0.17, 0.17, 0.16, 14]} />
        <meshStandardMaterial color="#8a8d92" {...METAL} />
      </mesh>
      {/* Connecting rod (real slider-crank orientation) */}
      <mesh ref={rod}>
        <boxGeometry args={[0.07, ROD_LENGTH, 0.07]} />
        <meshStandardMaterial color="#9a9da2" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function EngineModel({
  rpm,
  vibration,
  visual,
  onSelect,
  hovered,
  setHovered,
}: {
  rpm: number;
  vibration: number;
  visual: EngineVisualState;
  onSelect: (id: SubsystemId) => void;
  hovered: SubsystemId | null;
  setHovered: (id: SubsystemId | null) => void;
}) {
  const angleRef = useRef(0);
  const crankMesh = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const clock = useRef(0);

  const throws = useMemo(() => CYL_XS.map((x, i) => ({ x, phase: (i * Math.PI) / 2 })), []);

  useFrame((_, delta) => {
    const radiansPerSecond = (rpm / 4550) * 5;
    angleRef.current += radiansPerSecond * delta;
    if (crankMesh.current) crankMesh.current.rotation.x = angleRef.current;

    clock.current += delta;
    if (rig.current) {
      const jitter = Math.min(vibration, 20) / 20;
      rig.current.position.y = Math.sin(clock.current * 42) * jitter * 0.015;
      rig.current.position.z = Math.cos(clock.current * 37) * jitter * 0.012;
    }
  });

  return (
    <group ref={rig}>
      {/* Crankcase -- open-front cutaway so the crankshaft is visible, not enclosed */}
      <mesh
        position={[0, -0.35, -0.35]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered("crankshaft");
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect("crankshaft");
        }}
      >
        <boxGeometry args={[3.3, 0.55, 0.35]} />
        <meshStandardMaterial color={visual.healthColor} emissive={visual.healthColor} emissiveIntensity={hovered === "crankshaft" ? 0.35 : 0.08} {...METAL} />
      </mesh>
      <mesh position={[-1.65, -0.1, -0.35]}>
        <boxGeometry args={[0.12, 1.1, 0.35]} />
        <meshStandardMaterial color={HOUSING_COLOR} {...METAL} />
      </mesh>
      <mesh position={[1.65, -0.1, -0.35]}>
        <boxGeometry args={[0.12, 1.1, 0.35]} />
        <meshStandardMaterial color={HOUSING_COLOR} {...METAL} />
      </mesh>

      {/* Crankshaft (rotating) */}
      <group ref={crankMesh}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, CYL_BASE_Y - ROD_LENGTH, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 3.1, 16]} />
          <meshStandardMaterial color={visual.healthColor} {...METAL} />
        </mesh>
        {throws.map(({ x, phase }, i) => {
          const y = CRANK_RADIUS * Math.cos(phase);
          const z = CRANK_RADIUS * Math.sin(phase);
          return (
            <mesh key={i} position={[x, CYL_BASE_Y - ROD_LENGTH + y, z]}>
              <cylinderGeometry args={[0.09, 0.09, 0.3, 10]} />
              <meshStandardMaterial color="#75787d" {...METAL} />
            </mesh>
          );
        })}
      </group>

      {throws.map(({ x, phase }, i) => (
        <CylinderUnit
          key={i}
          x={x}
          phase={phase}
          angleRef={angleRef}
          visual={visual}
          onSelect={onSelect}
          hovered={hovered}
          setHovered={setHovered}
        />
      ))}

      {/* Oil sump -- lubrication subsystem, at the base rather than a floating ring */}
      <mesh
        position={[0, -0.68, -0.1]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered("lubrication");
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect("lubrication");
        }}
      >
        <boxGeometry args={[2.6, 0.26, 0.75]} />
        <meshStandardMaterial
          color={visual.lubricationColor}
          emissive={visual.lubricationColor}
          emissiveIntensity={0.15 + visual.oilGlow * 0.4 + (hovered === "lubrication" ? 0.3 : 0)}
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>

      {/* Sensor node -- mounted on the housing, not floating in space */}
      <mesh
        position={[1.75, 0.5, -0.3]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered("sensor");
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect("sensor");
        }}
      >
        <sphereGeometry args={[0.09, 14, 14]} />
        <meshStandardMaterial
          color={visual.sensorColor}
          emissive={visual.sensorColor}
          emissiveIntensity={hovered === "sensor" ? 0.7 : 0.2}
          metalness={0.2}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[1.75, 0.3, -0.3]}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 8]} />
        <meshStandardMaterial color="#4a4d51" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}
