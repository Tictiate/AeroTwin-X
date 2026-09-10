import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type {
  DegradationState,
  MissionProfile,
  MissionSimulationResult,
  WhatIfResult,
  WhatIfScenario,
} from "../api/types";
import { humanize } from "../lib/status";
import { StatusPill } from "./StatusPill";

const DEFAULT_SCENARIO: WhatIfScenario = {
  cruiseDurationMultiplier: 1.5,
  loadDelta: 0.1,
  throttleDelta: 0.1,
  selectedPhases: ["CRUISE", "LOITER"],
  faultTypeOverride: null,
};

/**
 * Mirrors the backend's FaultType enum (physics-service/app/simulation/fault_models.py) and
 * the fault_type values mission_simulator.py branches on. "NORMAL" here means "send null" —
 * the backend has no NORMAL fault-type value, an absent faultType is what produces a
 * healthy trajectory.
 */
const FAULT_TYPES = ["NORMAL", "INJECTOR_DEGRADATION", "LUBRICATION_DEGRADATION", "MISFIRE", "SENSOR_DRIFT"] as const;
type FaultTypeOption = (typeof FAULT_TYPES)[number];

function toFaultType(option: FaultTypeOption): string | null {
  return option === "NORMAL" ? null : option;
}

function FaultTypeSelect({
  value,
  onChange,
  label,
}: {
  value: FaultTypeOption;
  onChange: (value: FaultTypeOption) => void;
  label: string;
}) {
  return (
    <div className="control-group">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as FaultTypeOption)}>
        {FAULT_TYPES.map((type) => (
          <option key={type} value={type}>
            {humanize(type)}
          </option>
        ))}
      </select>
    </div>
  );
}

function PhaseTimeline({ result }: { result: MissionSimulationResult }) {
  return (
    <div className="phase-timeline">
      {result.phaseResults.map((phase) => (
        <div className="phase-chip" key={phase.phase}>
          <div className="phase-name">{phase.phase}</div>
          <div className="phase-health">
            {phase.startHealth.toFixed(1)} → {phase.endHealth.toFixed(1)}
          </div>
          <StatusPill value={phase.riskBand} />
        </div>
      ))}
    </div>
  );
}

function ResultSummary({ label, result }: { label: string; result: MissionSimulationResult }) {
  return (
    <div className="compare-col">
      <h3>{label}</h3>
      <div className="stat-line">
        <span className="k">Risk score</span>
        <span>{result.missionRiskScore.toFixed(3)}</span>
      </div>
      <div className="stat-line">
        <span className="k">Reliability</span>
        <span>{(result.missionReliabilityScore * 100).toFixed(1)}%</span>
      </div>
      <div className="stat-line">
        <span className="k">Projected end health</span>
        <span>{result.projectedEndHealth.toFixed(1)}</span>
      </div>
      <div className="stat-line">
        <span className="k">Minimum health</span>
        <span>{result.minimumProjectedHealth.toFixed(1)}</span>
      </div>
      <div className="stat-line">
        <span className="k">Critical phase</span>
        <span>{result.criticalPhase}</span>
      </div>
      <div className="stat-line">
        <span className="k">Worst component degradation</span>
        <span>
          {(Math.max(0, ...Object.values(result.finalComponentDegradation)) * 100).toFixed(1)}%
        </span>
      </div>
      <div className="stat-line">
        <span className="k">Sensor observability risk</span>
        <span>{(result.sensorObservabilityRisk * 100).toFixed(1)}%</span>
      </div>
      <div className="stat-line">
        <span className="k">Recommendation</span>
        <StatusPill value={result.riskBand} label={humanize(result.operatorRecommendation)} />
      </div>
    </div>
  );
}

export function MissionSection({
  currentDegradation,
  initialRulHours,
}: {
  currentDegradation: DegradationState | null;
  initialRulHours: number | null;
}) {
  const [profile, setProfile] = useState<MissionProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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
    if (!profile) return;
    setSimBusy(true);
    setSimError(null);
    try {
      const result = await api.simulateMission({
        profile,
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
    if (!profile) return;
    setWhatIfBusy(true);
    setWhatIfError(null);
    try {
      const result = await api.runWhatIf({
        baseMission: profile,
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
    <div className="mission-section">
      <div className="grid">
        <section className="panel">
          <div className="panel-title">
            <h2>Mission Simulation</h2>
          </div>

          {profileError && <p className="panel-error">{profileError}</p>}
          {!profile && !profileError && <p className="panel-loading">Loading default mission profile…</p>}

          {profile && (
            <>
              <div className="phase-timeline" style={{ marginBottom: 12 }}>
                {profile.phases.map((phase) => (
                  <div className="phase-chip" key={phase.phase}>
                    <div className="phase-name">{phase.phase}</div>
                    <div className="phase-health">{Math.round(phase.durationSeconds / 60)} min</div>
                  </div>
                ))}
              </div>

              <div className="mission-controls" style={{ marginBottom: 12 }}>
                <FaultTypeSelect value={simFaultType} onChange={setSimFaultType} label="Fault condition" />
                <button className="action" onClick={runSimulation} disabled={simBusy}>
                  {simBusy ? "Simulating…" : "Run Mission Simulation"}
                </button>
              </div>
              {currentDegradation && (
                <span style={{ marginLeft: 10, fontSize: 11, color: "var(--text-faint)" }}>
                  using current live engine condition as the starting point
                </span>
              )}
              {simError && <p className="panel-error">{simError}</p>}

              {simResult && (
                <div style={{ marginTop: 14 }}>
                  <PhaseTimeline result={simResult} />
                  <div className="delta-strip">
                    <div className="delta-item">
                      <span className="k">Risk band</span>
                      <StatusPill value={simResult.riskBand} />
                    </div>
                    <div className="delta-item">
                      <span className="k">Reliability</span>
                      <span className="v">{(simResult.missionReliabilityScore * 100).toFixed(1)}%</span>
                    </div>
                    <div className="delta-item">
                      <span className="k">End health</span>
                      <span className="v">{simResult.projectedEndHealth.toFixed(1)}</span>
                    </div>
                    <div className="delta-item">
                      <span className="k">Worst component deg.</span>
                      <span className="v">
                        {(Math.max(0, ...Object.values(simResult.finalComponentDegradation)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="delta-item">
                      <span className="k">Sensor observability risk</span>
                      <span className="v">{(simResult.sensorObservabilityRisk * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  <p className="interpretation">{simResult.operatorRationale}</p>
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>What-If Comparison</h2>
          </div>

          <div className="mission-controls">
            <div className="control-group">
              <label>Cruise duration ×</label>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={scenario.cruiseDurationMultiplier}
                onChange={(e) =>
                  setScenario((s) => ({ ...s, cruiseDurationMultiplier: Number(e.target.value) }))
                }
              />
              <span className="control-value">{scenario.cruiseDurationMultiplier.toFixed(1)}×</span>
            </div>
            <div className="control-group">
              <label>Load delta</label>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.05}
                value={scenario.loadDelta}
                onChange={(e) => setScenario((s) => ({ ...s, loadDelta: Number(e.target.value) }))}
              />
              <span className="control-value">
                {scenario.loadDelta >= 0 ? "+" : ""}
                {(scenario.loadDelta * 100).toFixed(0)}%
              </span>
            </div>
            <div className="control-group">
              <label>Throttle delta</label>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.05}
                value={scenario.throttleDelta}
                onChange={(e) => setScenario((s) => ({ ...s, throttleDelta: Number(e.target.value) }))}
              />
              <span className="control-value">
                {scenario.throttleDelta >= 0 ? "+" : ""}
                {(scenario.throttleDelta * 100).toFixed(0)}%
              </span>
            </div>
            <FaultTypeSelect value={whatIfFaultType} onChange={setWhatIfFaultType} label="Scenario fault" />
            <button className="action" onClick={runWhatIf} disabled={whatIfBusy || !profile}>
              {whatIfBusy ? "Comparing…" : "Run What-If"}
            </button>
          </div>
          {whatIfFaultType !== "NORMAL" && (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Baseline stays healthy; only the scenario column carries the selected fault, so the delta isolates its
              effect.
            </span>
          )}
          {whatIfError && <p className="panel-error">{whatIfError}</p>}

          {whatIfResult && (
            <div style={{ marginTop: 14 }}>
              <div className="compare-grid">
                <ResultSummary label="Baseline" result={whatIfResult.baseline} />
                <ResultSummary label="Scenario" result={whatIfResult.scenario} />
              </div>
              <div className="delta-strip">
                <div className="delta-item">
                  <span className="k">Δ risk</span>
                  <span className={`v ${whatIfResult.delta.risk > 0 ? "up" : "down"}`}>
                    {whatIfResult.delta.risk >= 0 ? "+" : ""}
                    {whatIfResult.delta.risk.toFixed(3)}
                  </span>
                </div>
                <div className="delta-item">
                  <span className="k">Δ reliability</span>
                  <span className={`v ${whatIfResult.delta.reliability < 0 ? "up" : "down"}`}>
                    {whatIfResult.delta.reliability >= 0 ? "+" : ""}
                    {(whatIfResult.delta.reliability * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="delta-item">
                  <span className="k">Δ end health</span>
                  <span className={`v ${whatIfResult.delta.endHealth < 0 ? "up" : "down"}`}>
                    {whatIfResult.delta.endHealth >= 0 ? "+" : ""}
                    {whatIfResult.delta.endHealth.toFixed(1)}
                  </span>
                </div>
              </div>
              <p className="interpretation">{whatIfResult.interpretation}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
