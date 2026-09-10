import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { FaultTypeName, SimulatorFaultState } from "../api/types";
import { humanize } from "../lib/status";
import { StatusPill } from "./StatusPill";

const FAULT_TYPES: FaultTypeName[] = [
  "NORMAL",
  "INJECTOR_DEGRADATION",
  "LUBRICATION_DEGRADATION",
  "MISFIRE",
  "SENSOR_DRIFT",
];

/**
 * Controls the LIVE telemetry simulator's fault state — distinct from the Mission section's
 * fault selector, which only simulates a hypothetical future mission and never touches the
 * live telemetry/diagnostics chain. This panel is what actually makes the primary dashboard
 * (Health, Diagnosis, Sensor Isolation, Degradation/RUL) show a fault happening in real time.
 *
 * The onset/ramp timing (~120s grace period, then a ~120s ramp to full severity) is the same
 * schedule the offline dataset generator uses. A severity override replaces the ramp SHAPE
 * once onset is reached, but the 120s onset delay itself always applies — this panel does not
 * shortcut it, so the demo honestly reflects real detection latency.
 */
export function SimulatorControlPanel() {
  const [state, setState] = useState<SimulatorFaultState | null>(null);
  const [selected, setSelected] = useState<FaultTypeName>("NORMAL");
  const [severityInput, setSeverityInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api
      .getSimulatorFault()
      .then(setState)
      .catch(() => {
        /* surfaced elsewhere via the main diagnostics poll; this panel just stays stale */
      });
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const severity = severityInput.trim() === "" ? null : Number(severityInput);
      const result = await api.setSimulatorFault(selected, severity);
      setState(result);
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
      const result = await api.setSimulatorFault("NORMAL", null);
      setState(result);
      setSelected("NORMAL");
      setSeverityInput("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset simulator");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-title">
        <h2>Live Simulator Fault Control</h2>
        {state && <StatusPill value={state.active ? "DEGRADED" : "HEALTHY"} label={state.faultType === "NORMAL" ? "HEALTHY" : humanize(state.faultType)} />}
      </div>

      <div className="mission-controls">
        <div className="control-group">
          <label>Fault condition</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value as FaultTypeName)}>
            {FAULT_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label>Severity override (blank = natural ramp)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="auto"
            value={severityInput}
            onChange={(e) => setSeverityInput(e.target.value)}
            style={{
              background: "var(--bg-panel-raised)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 12.5,
              width: 90,
            }}
          />
        </div>
        <button className="action" onClick={apply} disabled={busy}>
          {busy ? "Applying…" : "Activate"}
        </button>
        <button className="action" onClick={reset} disabled={busy}>
          Reset to Healthy
        </button>
      </div>

      {error && <p className="panel-error">{error}</p>}

      {state && (
        <div className="stat-line" style={{ marginTop: 10 }}>
          <span className="k">Simulator state</span>
          <span>
            {state.faultType} · {state.active ? "active" : "inactive"} · elapsed{" "}
            {state.elapsedFaultSeconds.toFixed(0)}s since activation
            {state.severityOverride != null && ` · fixed severity ${state.severityOverride.toFixed(2)}`}
          </span>
        </div>
      )}
      {state && state.active && state.elapsedFaultSeconds < 120 && (
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
          Onset grace period: this fault won't visibly affect telemetry until ~120s after activation.
          That delay is part of the validated fault schedule (same as offline dataset generation) and
          applies even with a severity override — only the ramp shape after onset changes, not the
          onset delay itself.
        </p>
      )}
    </section>
  );
}
