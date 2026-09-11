import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useDiagnostics, type DiagnosticsFetchState } from "../hooks/useDiagnostics";
import { useTelemetryStream, type TelemetryStream } from "../hooks/useTelemetryStream";
import type { DiagnosticSnapshot, SimulatorFaultState, Telemetry } from "../api/types";

const FAULT_POLL_MS = 4000;

interface AppData {
  diagnostics: DiagnosticsFetchState;
  snapshot: DiagnosticSnapshot | null;
  stream: TelemetryStream;
  effectiveTelemetry: Telemetry | null;
  simulatorFault: SimulatorFaultState | null;
  refreshSimulatorFault: () => void;
}

const AppDataContext = createContext<AppData | null>(null);

/**
 * Single subscription point for the two live data sources (2s diagnostics poll, 1Hz
 * WebSocket telemetry) plus a light poll of the simulator's active fault state, shared
 * across every page via context instead of each page re-subscribing independently.
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const diagnostics = useDiagnostics();
  const stream = useTelemetryStream();
  const [simulatorFault, setSimulatorFault] = useState<SimulatorFaultState | null>(null);

  const snapshot = diagnostics.kind === "ok" ? diagnostics.snapshot : null;
  const fallbackTelemetry =
    snapshot?.telemetry ?? (diagnostics.kind === "unavailable" ? diagnostics.body.telemetry ?? null : null);
  const effectiveTelemetry = stream.latest ?? fallbackTelemetry ?? null;

  const pollFault = () => {
    api
      .getSimulatorFault()
      .then((state) => setSimulatorFault(state))
      .catch(() => {
        /* transient -- keep last known fault state rather than clearing it */
      });
  };

  useEffect(() => {
    pollFault();
    const interval = setInterval(pollFault, FAULT_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppDataContext.Provider
      value={{ diagnostics, snapshot, stream, effectiveTelemetry, simulatorFault, refreshSimulatorFault: pollFault }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
