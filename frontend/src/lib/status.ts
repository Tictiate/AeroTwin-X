/**
 * Maps the backend's various status/band string enums onto one shared 4-tier color scale
 * (healthy / caution / degraded / critical) plus "unknown" for anything unrecognized.
 * Centralizing this means every panel renders the same status consistently.
 */
export type StatusTier = "healthy" | "caution" | "degraded" | "critical" | "unknown";

const MAP: Record<string, StatusTier> = {
  HEALTHY: "healthy",
  NORMAL: "healthy",
  STABLE: "healthy",
  LOW: "healthy",
  MISSION_GO: "healthy",

  CAUTION: "caution",
  SUSPECT: "caution",
  GUARDED: "caution",
  MISSION_CAUTION: "caution",
  ESTIMATED: "caution",

  DEGRADED: "degraded",
  DEGRADING: "degraded",
  AT_RISK: "degraded",
  MISSION_AT_RISK: "degraded",
  SENSOR_FAULT: "degraded",
  UNRELIABLE: "degraded",

  CRITICAL: "critical",
  HIGH_RISK: "critical",
  MISSION_HIGH_RISK: "critical",
  PHYSICAL_FAULT: "critical",
  LOW_RUL: "critical",

  INSUFFICIENT_HISTORY: "unknown",
};

export function statusTier(raw: string | null | undefined): StatusTier {
  if (!raw) return "unknown";
  return MAP[raw] ?? "unknown";
}

export function humanize(raw: string | null | undefined): string {
  if (!raw) return "—";
  return raw
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}
