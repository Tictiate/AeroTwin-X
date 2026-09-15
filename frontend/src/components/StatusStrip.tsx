import { isSynchronized, useTwinSyncFlags, type TwinSyncFlags } from "./twin3d/TwinSyncSequence";

/**
 * Persistent top-of-page synchronization strip. Reuses the same real
 * signals as the Digital Twin's sync sequence (stream status, snapshot
 * presence) -- never a decorative "always green" indicator.
 */

const STEPS: Array<{ id: keyof TwinSyncFlags; label: string }> = [
  { id: "telemetry", label: "Telemetry" },
  { id: "physics", label: "Physics" },
  { id: "ai", label: "AI" },
  { id: "health", label: "Health" },
];

export function StatusStrip() {
  const flags = useTwinSyncFlags();
  const synced = isSynchronized(flags);

  return (
    <div className="status-strip">
      <span className={`status-strip-item ${synced ? "ok" : ""}`}>
        <span className="dot" aria-hidden="true" />
        {synced ? "Twin Synchronized" : "Synchronizing"}
      </span>
      {STEPS.map((s) => (
        <span key={s.id} className={`status-strip-item ${flags[s.id] ? "ok" : ""}`}>
          <span className="dot" aria-hidden="true" />
          {s.label}
        </span>
      ))}
      <span className="status-strip-tagline">Real engines. Real physics. Real insight.</span>
    </div>
  );
}
