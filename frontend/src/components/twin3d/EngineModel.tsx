import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * A stylized but mechanically coherent inline 4-cylinder aircraft engine: real
 * slider-crank kinematics drive piston/rod motion from a single rotating
 * crankshaft angle, not independent arbitrary animation. Geometry is a
 * technical cutaway illustration (finned air-cooled barrels, rocker covers,
 * exhaust risers, a prop-shaft stub) -- not a CAD model, but built to read
 * immediately as a piston aircraft engine rather than stacked primitives.
 */

const CRANK_RADIUS = 0.28;
const ROD_LENGTH = 0.85;
const CYL_XS = [-1.2, -0.4, 0.4, 1.2];
const CYL_BASE_Y = 0.95;

// Neutral structural finish -- everything that ISN'T a fault-tinted surface
// uses one of these, so the engine still looks considered while fully healthy.
// envMapIntensity varies per finish so different components read as different
// materials under the same baked reflection environment (matte painted case
// vs. machined steel vs. dark composite), without touching any geometry.
const GRAPHITE = { color: "#26282c", metalness: 0.5, roughness: 0.58, envMapIntensity: 0.6 };
const ALUMINUM = { color: "#aab0b7", metalness: 0.74, roughness: 0.3, envMapIntensity: 1.1 };
const STEEL = { color: "#d7dbe0", metalness: 0.9, roughness: 0.18, envMapIntensity: 1.35 };
const DARK_STEEL = { color: "#34363b", metalness: 0.55, roughness: 0.48, envMapIntensity: 0.55 };
const MACHINED_DARK = { color: "#3a3d43", metalness: 0.85, roughness: 0.26, envMapIntensity: 1.15 };
const FASTENER = { color: "#57595e", metalness: 0.62, roughness: 0.32, envMapIntensity: 0.9 };

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

const BARREL_RADIUS = 0.2;
const FIN_YS = [0.22, 0.4, 0.58];

function CylinderUnit({ x, phase, angleRef, visual, onSelect, hovered, setHovered }: CylinderUnitProps) {
  const piston = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);

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
      {/* Finned barrel -- the air-cooled-cylinder silhouette that reads as "aircraft engine" */}
      <mesh position={[x, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[BARREL_RADIUS, BARREL_RADIUS * 1.03, 0.84, 18]} />
        <meshStandardMaterial color={visual.cylinderColor} metalness={0.6} roughness={0.4} envMapIntensity={0.9} />
      </mesh>
      {FIN_YS.map((y) => (
        <mesh key={y} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[BARREL_RADIUS + 0.035, 0.022, 6, 20]} />
          <meshStandardMaterial {...ALUMINUM} color="#565a60" />
        </mesh>
      ))}

      {/* Rocker cover / cylinder head */}
      <mesh
        position={[x, 1.02, 0]}
        castShadow
        receiveShadow
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
        <boxGeometry args={[0.5, 0.17, 0.5]} />
        <meshStandardMaterial
          color={visual.cylinderColor}
          emissive={visual.cylinderColor}
          emissiveIntensity={0.22 + visual.thermalGlow * 0.5 + (isHovered ? 0.25 : 0)}
          metalness={0.7}
          roughness={0.22}
          envMapIntensity={1.1}
        />
      </mesh>
      {[-0.19, 0.19].map((dx) => (
        <mesh key={dx} position={[x + dx, 1.11, 0.19]}>
          <cylinderGeometry args={[0.018, 0.018, 0.06, 8]} />
          <meshStandardMaterial {...FASTENER} />
        </mesh>
      ))}

      {/* Exhaust riser -- angled stub exiting the head, unaffected by fault state (structural detail only) */}
      <mesh position={[x, 0.51, 0.39]} rotation={[2.4, 0, 0]}>
        <cylinderGeometry args={[0.032, 0.04, 0.4, 10]} />
        <meshStandardMaterial {...DARK_STEEL} />
      </mesh>

      {/* Injector */}
      <mesh
        position={[x, 1.24, 0]}
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
        <cylinderGeometry args={[0.045, 0.055, 0.24, 12]} />
        <meshStandardMaterial
          color={visual.injectorColor}
          emissive={visual.injectorColor}
          emissiveIntensity={hovered === "injectors" ? 0.5 : 0.15}
          metalness={0.72}
          roughness={0.24}
          envMapIntensity={1}
        />
      </mesh>
      <mesh position={[x, 1.38, 0]}>
        <coneGeometry args={[0.05, 0.08, 10]} />
        <meshStandardMaterial color={visual.injectorColor} metalness={0.72} roughness={0.24} envMapIntensity={1} />
      </mesh>

      {/* Piston -- real slider-crank position */}
      <group ref={piston}>
        <mesh>
          <cylinderGeometry args={[0.165, 0.17, 0.15, 18]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <mesh position={[0, 0.082, 0]}>
          <cylinderGeometry args={[0.15, 0.165, 0.015, 18]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      </group>

      {/* Connecting rod -- real slider-crank orientation, forged-look end caps */}
      <group ref={rod}>
        <mesh>
          <boxGeometry args={[0.06, ROD_LENGTH, 0.06]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <mesh position={[0, ROD_LENGTH / 2 - 0.02, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.05, 12]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <mesh position={[0, -(ROD_LENGTH / 2 - 0.02), 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.05, 12]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      </group>
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
        castShadow
        receiveShadow
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
        <meshStandardMaterial
          color={visual.healthColor}
          emissive={visual.healthColor}
          emissiveIntensity={hovered === "crankshaft" ? 0.35 : 0.05}
          metalness={0.32}
          roughness={0.56}
          envMapIntensity={0.65}
        />
      </mesh>
      {/* Rounded case ends -- breaks the rectangular-block silhouette */}
      {[-1.65, 1.65].map((x) => (
        <mesh key={x} position={[x, -0.1, -0.35]}>
          <cylinderGeometry args={[0.16, 0.19, 1.1, 14]} />
          <meshStandardMaterial {...GRAPHITE} />
        </mesh>
      ))}

      {/* Crankshaft (rotating) */}
      <group ref={crankMesh}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, CYL_BASE_Y - ROD_LENGTH, 0]}>
          <cylinderGeometry args={[0.105, 0.105, 3.1, 18]} />
          <meshStandardMaterial color={visual.healthColor} metalness={0.88} roughness={0.16} envMapIntensity={1.2} />
        </mesh>
        {/* Prop-shaft stub -- the crank's visible output, extending past the last cylinder */}
        <mesh rotation={[0, 0, Math.PI / 2]} position={[1.92, CYL_BASE_Y - ROD_LENGTH, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.42, 14]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 2]} position={[2.19, CYL_BASE_Y - ROD_LENGTH, 0]}>
          <coneGeometry args={[0.13, 0.16, 12]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>

        {/* Propeller -- hub + 2 blades, real RPM-driven by the same rotating group */}
        <mesh position={[2.42, CYL_BASE_Y - ROD_LENGTH, 0]}>
          <sphereGeometry args={[0.1, 14, 14]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        {[1, -1].map((sign) => (
          <mesh
            key={sign}
            position={[2.42, CYL_BASE_Y - ROD_LENGTH + sign * 0.46, 0]}
            rotation={[0, 0.3 * sign, 0]}
          >
            <boxGeometry args={[0.045, 0.82, 0.13]} />
            <meshStandardMaterial {...DARK_STEEL} />
          </mesh>
        ))}

        {/* Flywheel / accessory-drive disc at the rear, real RPM-driven */}
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-1.92, CYL_BASE_Y - ROD_LENGTH, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.09, 26]} />
          <meshStandardMaterial {...MACHINED_DARK} />
        </mesh>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const ty = CYL_BASE_Y - ROD_LENGTH + 0.36 * Math.cos(a);
          const tz = 0.36 * Math.sin(a);
          return (
            <mesh key={i} position={[-1.92, ty, tz]}>
              <boxGeometry args={[0.05, 0.05, 0.045]} />
              <meshStandardMaterial {...FASTENER} />
            </mesh>
          );
        })}

        {throws.map(({ x, phase }, i) => {
          const y = CRANK_RADIUS * Math.cos(phase);
          const z = CRANK_RADIUS * Math.sin(phase);
          return (
            <group key={i}>
              {/* Crank web / counterweight disc */}
              <mesh rotation={[0, 0, Math.PI / 2]} position={[x, CYL_BASE_Y - ROD_LENGTH, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 0.055, 16]} />
                <meshStandardMaterial {...MACHINED_DARK} />
              </mesh>
              <mesh position={[x, CYL_BASE_Y - ROD_LENGTH + y, z]}>
                <cylinderGeometry args={[0.085, 0.085, 0.3, 10]} />
                <meshStandardMaterial {...STEEL} />
              </mesh>
            </group>
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

      {/* Oil sump -- stepped saddle + pan silhouette instead of a single flat slab */}
      <mesh
        position={[0, -0.62, -0.12]}
        castShadow
        receiveShadow
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
        <boxGeometry args={[2.7, 0.14, 0.78]} />
        <meshStandardMaterial
          color={visual.lubricationColor}
          emissive={visual.lubricationColor}
          emissiveIntensity={0.12 + visual.oilGlow * 0.35 + (hovered === "lubrication" ? 0.3 : 0)}
          metalness={0.3}
          roughness={0.52}
          envMapIntensity={0.7}
        />
      </mesh>
      <mesh
        position={[0, -0.78, -0.1]}
        castShadow
        receiveShadow
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
        <boxGeometry args={[1.9, 0.2, 0.66]} />
        <meshStandardMaterial
          color={visual.lubricationColor}
          emissive={visual.lubricationColor}
          emissiveIntensity={0.15 + visual.oilGlow * 0.4 + (hovered === "lubrication" ? 0.3 : 0)}
          metalness={0.3}
          roughness={0.52}
          envMapIntensity={0.7}
        />
      </mesh>

      {/* Sensor node -- compact potted housing mounted flush on the case, positioned
          clear of the barrel/fin silhouette from the default camera angle */}
      <mesh
        position={[-1.78, 0.8, 0.18]}
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
        <sphereGeometry args={[0.085, 14, 14]} />
        <meshStandardMaterial
          color={visual.sensorColor}
          emissive={visual.sensorColor}
          emissiveIntensity={hovered === "sensor" ? 0.7 : 0.2}
          metalness={0.25} roughness={0.4}
        />
      </mesh>
      <mesh position={[-1.78, 0.66, 0.18]}>
        <cylinderGeometry args={[0.022, 0.03, 0.2, 8]} />
        <meshStandardMaterial {...DARK_STEEL} />
      </mesh>
      <mesh position={[-1.78, 0.57, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.05, 0.012, 6, 16]} />
        <meshStandardMaterial {...FASTENER} />
      </mesh>
    </group>
  );
}
