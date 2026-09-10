import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { DiagnosticSnapshot, ServiceUnavailableBody } from "../api/types";

const POLL_INTERVAL_MS = 2000;

export type DiagnosticsFetchState =
  | { kind: "loading" }
  | { kind: "ok"; snapshot: DiagnosticSnapshot }
  | { kind: "unavailable"; body: ServiceUnavailableBody }
  | { kind: "error"; message: string };

/**
 * Polls the aggregate /api/diagnostics/current endpoint every 2s. This is the single
 * source of truth for the dashboard: telemetry, physics prediction, residuals, ML
 * analysis, health, degradation and RUL all arrive together as one consistent snapshot,
 * which avoids showing mismatched data pulled from different points in time.
 */
export function useDiagnostics(): DiagnosticsFetchState {
  const [state, setState] = useState<DiagnosticsFetchState>({ kind: "loading" });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    const tick = async () => {
      try {
        const snapshot = await api.getDiagnostics();
        if (!cancelled.current) setState({ kind: "ok", snapshot });
      } catch (error) {
        if (cancelled.current) return;
        if (error instanceof ApiError && error.body) {
          setState({ kind: "unavailable", body: error.body });
        } else {
          const message = error instanceof Error ? error.message : "Unknown error";
          setState({ kind: "error", message });
        }
      }
    };

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
