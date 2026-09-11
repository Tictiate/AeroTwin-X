import { useEffect, useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { api, ApiError } from "../api/client";
import type { MissionProfile, MissionSimulationResult, WhatIfResult, WhatIfScenario } from "../api/types";
import { humanize, statusTier } from "../lib/status";
import { StatusPill } from "../components/StatusPill";

const DEFAULT_SCENARIO: WhatIfScenario = {
  cruiseDurationMultiplier: 1.5,
  loadDelta: 0.1,
  throttleDelta: 0.1,
  selectedPhases: ["CRUISE", "LOITER"],
  faultTypeOverride: null,
};

/**
 * Alternate profiles reuse the same MissionPhaseSpec contract as the default profile, varying only
 * altitude/throttle/ambientTemperature per phase -- the same fields the existing physics/health/
 * degradation pipeline already consumes. No new physics, no new endpoint.
 */
const HIGH_ALTITUDE_PROFILE: MissionProfile = {
  missionId: "MISSION-HIGH-ALT-01",
  phases: [
    { phase: "TAKEOFF", durationSeconds: 120, altitudeStart: 0, altitudeEnd: 500, throttle: 0.9, load: 0.85, ambientTemperature: 15 },
    { phase: "CLIMB", durationSeconds: 480, altitudeStart: 500, altitudeEnd: 18000, throttle: 0.85, load: 0.8, ambientTemperature: -5 },
    { phase: "CRUISE", durationSeconds: 1800, altitudeStart: 18000, altitudeEnd: 18000, throttle: 0.68, load: 0.55, ambientTemperature: -20 },
    { phase: "LOITER", durationSeconds: 900, altitudeStart: 18000, altitudeEnd: 17000, throttle: 0.55, load: 0.45, ambientTemperature: -18 },
    { phase: "DESCENT", durationSeconds: 400, altitudeStart: 17000, altitudeEnd: 500, throttle: 0.3, load: 0.4, ambientTemperature: 5 },
    { phase: "LANDING", durationSeconds: 180, altitudeStart: 500, altitudeEnd: 0, throttle: 0.25, load: 0.35, ambientTemperature: 15 },
  ],
};

const HOT_WEATHER_PROFILE: MissionProfile = {
  missionId: "MISSION-HOT-WX-01",
  phases: [
    { phase: "TAKEOFF", durationSeconds: 120, altitudeStart: 0, altitudeEnd: 500, throttle: 0.9, load: 0.85, ambientTemperature: 42 },
    { phase: "CLIMB", durationSeconds: 300, altitudeStart: 500, altitudeEnd: 5000, throttle: 0.8, load: 0.75, ambientTemperature: 35 },
    { phase: "CRUISE", durationSeconds: 1800, altitudeStart: 5000, altitudeEnd: 5000, throttle: 0.62, load: 0.55, ambientTemperature: 30 },
    { phase: "LOITER", durationSeconds: 900, altitudeStart: 5000, altitudeEnd: 4500, throttle: 0.5, load: 0.45, ambientTemperature: 32 },
    { phase: "DESCENT", durationSeconds: 300, altitudeStart: 4500, altitudeEnd: 500, throttle: 0.35, load: 0.4, ambientTemperature: 38 },
    { phase: "LANDING", durationSeconds: 180, altitudeStart: 500, altitudeEnd: 0, throttle: 0.25, load: 0.35, ambientTemperature: 45 },
  ],
};

type PresetKey = "standard" | "highAltitude" | "hotWeather";

const PRESET_LABELS: Record<PresetKey, string> = {
  standard: "Standard",
  highAltitude: "High Altitude",
  hotWeather: "Hot Weather",
};

const PRESET_ASSUMPTIONS: Record<PresetKey, string> = {
  standard: "Cruise altitude 5,000 ft · ambient 5–15°C across phases.",
  highAltitude: "Cruise altitude 18,000 ft · ambient down to −20°C at cruise · higher cruise throttle to hold altitude in thinner air.",
  hotWeather: "Same altitude profile as the standard mission · ambient 30–45°C throughout, hottest at takeoff and landing.",
};

/**
 * Mirrors the backend's FaultType enum. "NORMAL" here means "send null" -- the backend has no
 * NORMAL fault-type value; an absent faultType is what produces a healthy trajectory.
 */
const FAULT_TYPES = ["NORMAL", "INJECTOR_DEGRADATION", "LUBRICATION_DEGRADATION", "MISFIRE", "SENSOR_DRIFT"] as const;
type FaultTypeOption = (typeof FAULT_TYPES)[number];

function toFaultType(option: FaultTypeOption): string | null {
  return option === "NORMAL" ? null : option;
}

function FaultTypeSelect({ value, onChange, label }: { value: FaultTypeOption; onChange: (v: FaultTypeOption) => void; label: string }) {
  return (
    <div>
      <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as FaultTypeOption)}>
        {FAULT_TYPES.map((type) => (
          <option key={type} value={type}>{humanize(type)}</option>
        ))}
      </select>
    </div>
  );
}

function PhaseStrip({ profile }: { profile: MissionProfile }) {
  return (
    <div className="grid-auto" style={{ gap: "var(--space-3)" }}>
      {profile.phases.map((phase) => (
        <div className="panel" key={phase.phase} style={{ padding: "var(--space-3) var(--space-4)" }}>
          <span className="eyebrow">{phase.phase}</span>
          <div className="data-row" style={{ padding: "4px 0" }}>
            <span className="label">Duration</span>
            <span className="value">{Math.round(phase.durationSeconds / 60)} min</span>
          </div>
          <div className="data-row" style={{ padding: "4px 0" }}>
            <span className="label">Altitude</span>
            <span className="value">{Math.round(phase.altitudeEnd)} ft</span>
          </div>
          <div className="data-row" style={{ padding: "4px 0" }}>
            <span className="label">Ambient</span>
            <span className="value">{phase.ambientTemperature.toFixed(0)}&deg;C</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PhaseResultTable({ result }: { result: MissionSimulationResult }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Phase</th>
          <th>Start health</th>
          <th>End health</th>
          <th>Risk band</th>
        </tr>
      </thead>
      <tbody>
        {result.phaseResults.map((phase) => (
          <tr key={phase.phase}>
            <td>{phase.phase}</td>
            <td>{phase.startHealth.toFixed(1)}</td>
            <td>{phase.endHealth.toFixed(1)}</td>
            <td><StatusPill value={phase.riskBand} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultColumn({ label, result }: { label: string; result: MissionSimulationResult }) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <div className="data-row"><span className="label">Risk score</span><span className="value">{result.missionRiskScore.toFixed(3)}</span></div>
      <div className="data-row"><span className="label">Reliability</span><span className="value">{(result.missionReliabilityScore * 100).toFixed(1)}%</span></div>
      <div className="data-row"><span className="label">Projected end health</span><span className="value">{result.projectedEndHealth.toFixed(1)}</span></div>
      <div className="data-row"><span className="label">Minimum health</span><span className="value">{result.minimumProjectedHealth.toFixed(1)}</span></div>
      <div className="data-row"><span className="label">Critical phase</span><span className="value">{result.criticalPhase}</span></div>
      <div className="data-row">
        <span className="label">Worst component degradation</span>
        <span className="value">{(Math.max(0, ...Object.values(result.finalComponentDegradation)) * 100).toFixed(1)}%</span>
      </div>
      <div className="data-row"><span className="label">Sensor observability risk</span><span className="value">{(result.sensorObservabilityRisk * 100).toFixed(1)}%</span></div>
      <div className="data-row">
        <span className="label">Recommendation</span>
        <StatusPill value={result.riskBand} label={humanize(result.operatorRecommendation)} />
      </div>
    </div>
  );
}

export default function Mission() {
  const { snapshot } = useAppData();
  const currentDegradation = snapshot?.degradation ?? null;
  const initialRulHours = snapshot?.rul?.rulHours ?? null;

  const [profile, setProfile] = useState<MissionProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState<PresetKey>("standard");

  const activeProfile: MissionProfile | null =
    presetKey === "standard" ? profile : presetKey === "highAltitude" ? HIGH_ALTITUDE_PROFILE : HOT_WEATHER_PROFILE;

  const [simResult, setSimResult] = useState<MissionSimulationResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simFaultType, setSimFaultType] = useState<FaultTypeOption>("NORMAL");

  const [scenario, setScenario] = useState<WhatIfScenario>(DEFAULT_SCENARIO);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
  const [whatIfFaultType, setWhatIfFaultType] = useState<FaultTypeOption>("NORMAL");

  useEffect(() => {
    api
      .getDefaultMissionProfile()
      .then(setProfile)
      .catch((error) => setProfileError(error instanceof Error ? error.message : "Failed to load mission profile"));
  }, []);

  const runSimulation = async () => {
    if (!activeProfile) return;
    setSimBusy(true);
    setSimError(null);
    try {
      const result = await api.simulateMission({
        profile: activeProfile,
        currentDegradation,
        initialRulHours,
        faultType: toFaultType(simFaultType),
      });
      setSimResult(result);
    } catch (error) {
      setSimError(error instanceof ApiError ? error.message : "Mission simulation failed");
    } finally {
      setSimBusy(false);
    }
  };

  const runWhatIf = async () => {
    if (!activeProfile) return;
    setWhatIfBusy(true);
    setWhatIfError(null);
    try {
      const result = await api.runWhatIf({
        baseMission: activeProfile,
        scenario: { ...scenario, faultTypeOverride: toFaultType(whatIfFaultType) },
        currentDegradation,
        initialRulHours,
      });
      setWhatIfResult(result);
    } catch (error) {
      setWhatIfError(error instanceof ApiError ? error.message : "What-if comparison failed");
    } finally {
      setWhatIfBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">Mission</span>
        <h1>How will this engine behave under a mission scenario?</h1>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Mission Simulation</h2>
          <div className="segmented">
            {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
              <button key={key} className={presetKey === key ? "active" : ""} onClick={() => setPresetKey(key)}>
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          {profileError && <div className="state-block critical"><span className="headline">Profile unavailable</span>{profileError}</div>}
          {!profile && !profileError && <div className="state-block">Loading default mission profile…</div>}

          {profile && activeProfile && (
            <>
              <p className="note" style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginBottom: 12 }}>
                {PRESET_ASSUMPTIONS[presetKey]}
              </p>

              <PhaseStrip profile={activeProfile} />

              <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-5)", marginTop: "var(--space-5)" }}>
                <FaultTypeSelect value={simFaultType} onChange={setSimFaultType} label="Fault condition" />
                <button className="btn btn-primary" onClick={runSimulation} disabled={simBusy}>
                  {simBusy ? "Simulating…" : "Run Mission Simulation"}
                </button>
                {currentDegradation && (
                  <span className="note" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                    Using current live engine condition as the starting point.
                  </span>
                )}
              </div>

              {simError && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 10 }}>{simError}</p>}

              {simResult && (
                <div style={{ marginTop: "var(--space-6)" }}>
                  <div className="grid-auto" style={{ marginBottom: "var(--space-5)" }}>
                    <div className="panel" style={{ padding: "var(--space-4)" }}>
                      <span className="eyebrow">Risk band</span>
                      <div style={{ marginTop: 8 }}><StatusPill value={simResult.riskBand} /></div>
                    </div>
                    <div className="panel" style={{ padding: "var(--space-4)" }}>
                      <span className="eyebrow">Reliability</span>
                      <div className="mono" style={{ fontSize: 22, marginTop: 6 }}>{(simResult.missionReliabilityScore * 100).toFixed(1)}%</div>
                    </div>
                    <div className="panel" style={{ padding: "var(--space-4)" }}>
                      <span className="eyebrow">End health</span>
                      <div className="mono" style={{ fontSize: 22, marginTop: 6 }}>{simResult.projectedEndHealth.toFixed(1)}</div>
                    </div>
                    <div className="panel" style={{ padding: "var(--space-4)" }}>
                      <span className="eyebrow">Sensor observability risk</span>
                      <div className="mono" style={{ fontSize: 22, marginTop: 6 }}>{(simResult.sensorObservabilityRisk * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <PhaseResultTable result={simResult} />
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>{simResult.operatorRationale}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>What-If Comparison</h2></div>
        <div className="panel">
          <div className="grid-auto" style={{ marginBottom: "var(--space-4)" }}>
            <div>
              <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Cruise duration &times;{scenario.cruiseDurationMultiplier.toFixed(1)}</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={scenario.cruiseDurationMultiplier}
                onChange={(e) => setScenario((s) => ({ ...s, cruiseDurationMultiplier: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
                Load delta {scenario.loadDelta >= 0 ? "+" : ""}{(scenario.loadDelta * 100).toFixed(0)}%
              </span>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.05}
                value={scenario.loadDelta}
                onChange={(e) => setScenario((s) => ({ ...s, loadDelta: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
                Throttle delta {scenario.throttleDelta >= 0 ? "+" : ""}{(scenario.throttleDelta * 100).toFixed(0)}%
              </span>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.05}
                value={scenario.throttleDelta}
                onChange={(e) => setScenario((s) => ({ ...s, throttleDelta: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>
            <FaultTypeSelect value={whatIfFaultType} onChange={setWhatIfFaultType} label="Scenario fault" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
            <button className="btn btn-primary" onClick={runWhatIf} disabled={whatIfBusy || !activeProfile}>
              {whatIfBusy ? "Comparing…" : "Run What-If"}
            </button>
            <span className="note" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              Runs against the {PRESET_LABELS[presetKey]} profile selected above.
            </span>
          </div>
          {whatIfFaultType !== "NORMAL" && (
            <p className="note" style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 6 }}>
              Baseline stays healthy; only the scenario column carries the selected fault, so the delta isolates its effect.
            </p>
          )}
          {whatIfError && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 10 }}>{whatIfError}</p>}

          {whatIfResult && (
            <div style={{ marginTop: "var(--space-6)" }}>
              <div className="grid-2" style={{ marginBottom: "var(--space-5)" }}>
                <ResultColumn label="Baseline" result={whatIfResult.baseline} />
                <ResultColumn label="Scenario" result={whatIfResult.scenario} />
              </div>
              <div className="grid-auto" style={{ marginBottom: "var(--space-4)" }}>
                <div className="panel" style={{ padding: "var(--space-4)" }}>
                  <span className="eyebrow">&Delta; Risk</span>
                  <div className="mono" data-tier={whatIfResult.delta.risk > 0 ? "degraded" : "healthy"} style={{ fontSize: 20, marginTop: 6 }}>
                    {whatIfResult.delta.risk >= 0 ? "+" : ""}{whatIfResult.delta.risk.toFixed(3)}
                  </div>
                </div>
                <div className="panel" style={{ padding: "var(--space-4)" }}>
                  <span className="eyebrow">&Delta; Reliability</span>
                  <div className="mono" data-tier={whatIfResult.delta.reliability < 0 ? "degraded" : "healthy"} style={{ fontSize: 20, marginTop: 6 }}>
                    {whatIfResult.delta.reliability >= 0 ? "+" : ""}{(whatIfResult.delta.reliability * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="panel" style={{ padding: "var(--space-4)" }}>
                  <span className="eyebrow">&Delta; End health</span>
                  <div className="mono" data-tier={whatIfResult.delta.endHealth < 0 ? "degraded" : "healthy"} style={{ fontSize: 20, marginTop: 6 }}>
                    {whatIfResult.delta.endHealth >= 0 ? "+" : ""}{whatIfResult.delta.endHealth.toFixed(1)}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{whatIfResult.interpretation}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
