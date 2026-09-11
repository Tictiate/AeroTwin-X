import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { DegradationState, MissionSimulationResult } from "../api/types";

/**
 * Runs the existing default-profile mission simulation against the engine's current live
 * degradation/RUL state -- reusing /api/mission/simulate exactly as the Mission page does,
 * not a new risk calculation. Re-runs when the diagnostic status changes (not on every 2s
 * poll tick) so Overview's mission summary reflects real state without hammering the endpoint.
 */
export function useMissionSnapshot(
  currentDegradation: DegradationState | null,
  initialRulHours: number | null,
  diagnosticType: string | null,
): { result: MissionSimulationResult | null; loading: boolean } {
  const [result, setResult] = useState<MissionSimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const key = `${diagnosticType ?? "none"}:${currentDegradation?.overallDegradation ?? "none"}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancelled = false;
    setLoading(true);
    api
      .getDefaultMissionProfile()
      .then((profile) =>
        api.simulateMission({
          profile,
          currentDegradation,
          initialRulHours,
          faultType: null,
        }),
      )
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        /* transient -- keep last known snapshot rather than clearing it */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticType, currentDegradation, initialRulHours]);

  return { result, loading };
}
