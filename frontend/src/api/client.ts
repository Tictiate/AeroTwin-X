import type {
  DiagnosticSnapshot,
  FaultTypeName,
  MissionProfile,
  MissionSimulationResult,
  ServiceUnavailableBody,
  SimulatorFaultState,
  Telemetry,
  WhatIfResult,
  WhatIfScenario,
  DegradationState,
} from "./types";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8080";

export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8080/ws/telemetry";

/**
 * Thrown for any non-2xx response. Carries the parsed JSON body (when present) so callers
 * can distinguish a structured 503 (status: "physics-unavailable" / "ml-unavailable" / ...)
 * from a genuine unexpected failure.
 */
export class ApiError extends Error {
  readonly httpStatus: number;
  readonly body: ServiceUnavailableBody | null;

  constructor(httpStatus: number, body: ServiceUnavailableBody | null, message: string) {
    super(message);
    this.name = "ApiError";
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const text = await response.text();
  const parsed = text.length > 0 ? JSON.parse(text) : null;

  if (!response.ok) {
    const body = parsed && typeof parsed === "object" ? (parsed as ServiceUnavailableBody) : null;
    const message = body?.message ?? `Request to ${path} failed with HTTP ${response.status}`;
    throw new ApiError(response.status, body, message);
  }

  return parsed as T;
}

export const api = {
  getTelemetry: () => request<Telemetry>("/api/telemetry/current"),
  getDiagnostics: () => request<DiagnosticSnapshot>("/api/diagnostics/current"),
  getDefaultMissionProfile: () => request<MissionProfile>("/api/mission/default-profile"),
  simulateMission: (body: {
    profile: MissionProfile;
    currentDegradation?: DegradationState | null;
    initialRulHours?: number | null;
    faultType?: string | null;
    stepSeconds?: number;
  }) =>
    request<MissionSimulationResult>("/api/mission/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  runWhatIf: (body: {
    baseMission: MissionProfile;
    scenario: WhatIfScenario;
    currentDegradation?: DegradationState | null;
    initialRulHours?: number | null;
    faultType?: string | null;
  }) =>
    request<WhatIfResult>("/api/mission/what-if", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSimulatorFault: () => request<SimulatorFaultState>("/api/simulator/fault"),
  setSimulatorFault: (faultType: FaultTypeName, severity: number | null) =>
    request<SimulatorFaultState>("/api/simulator/fault", {
      method: "POST",
      body: JSON.stringify({ faultType, severity }),
    }),
};
