import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { FaultTypeName, SimulatorFaultState } from "../api/types";
import { humanize } from "../lib/status";
import { StatusPill } from "./StatusPill";

const FAULT_TYPES: FaultTypeName[] = ["NORMAL", "INJECTOR_DEGRADATION", "LUBRICATION_DEGRADATION", "MISFIRE", "SENSOR_DRIFT"];

/**
 * Controls the LIVE telemetry simulator's fault state -- distinct from the Mission page's fault
 * selector, which only simulates a hypothetical future mission and never touches the live
 * telemetry/diagnostics chain. This is what actually makes Diagnostics/Reliability/Digital Twin
 * show a fault happening in real time.
 *
 * The ~120s onset grace period then ~120s ramp is the same schedule the offline dataset generator
 * uses. A severity override replaces the ramp shape after onset, never the onset delay itself.
 */
export function SimulatorControl({ state, onChanged }: { state: SimulatorFaultState | null; onChanged: () => void }) {
  const [selected, setSelected] = useState<FaultTypeName>("NORMAL");
  const [severityInput, setSeverityInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const severity = severityInput.trim() === "" ? null : Number(severityInput);
      await api.setSimulatorFault(selected, severity);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update simulator fault state");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setSimulatorFault("NORMAL", null);
      setSelected("NORMAL");
      setSeverityInput("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset simulator");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="section-head" style={{ marginBottom: "var(--space-3)" }}>
        <h2>Live Simulator Fault Control</h2>
        {state && <StatusPill value={state.active ? "DEGRADED" : "HEALTHY"} label={state.faultType === "NORMAL" ? "Healthy" : humanize(state.faultType)} />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-3)" }}>
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Fault condition</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value as FaultTypeName)}>
            {FAULT_TYPES.map((type) => (
              <option key={type} value={type}>{humanize(type)}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Severity (blank = auto)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="auto"
            value={severityInput}
            onChange={(e) => setSeverityInput(e.target.value)}
            style={{
              background: "var(--surface-raised)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "7px 10px",
              fontSize: 13,
              width: 84,
            }}
          />
        </div>
        <button className="btn btn-primary" onClick={apply} disabled={busy}>{busy ? "Applying…" : "Activate"}</button>
        <button className="btn btn-ghost" onClick={reset} disabled={busy}>Reset to Healthy</button>
      </div>

      {error && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {state && (
        <p className="note" style={{ marginTop: 10, color: "var(--text-tertiary)", fontSize: 12 }}>
          {state.faultType} · {state.active ? "active" : "inactive"} · elapsed {state.elapsedFaultSeconds.toFixed(0)}s since activation
          {state.severityOverride != null && ` · fixed severity ${state.severityOverride.toFixed(2)}`}
        </p>
      )}
      {state && state.active && state.elapsedFaultSeconds < 120 && (
        <p className="note" style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
          Onset grace period: this fault will not visibly affect telemetry until ~120s after activation, matching the
          validated offline fault schedule.
        </p>
      )}
    </div>
  );
}
