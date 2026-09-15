import { useAppData } from "../../context/AppDataContext";

export interface TwinSyncFlags {
  telemetry: boolean;
  physics: boolean;
  ai: boolean;
  health: boolean;
}

const STEPS: Array<{ id: keyof TwinSyncFlags; label: string }> = [
  { id: "telemetry", label: "Telemetry" },
  { id: "physics", label: "Physics" },
  { id: "ai", label: "AI" },
  { id: "health", label: "Health" },
];

/**
 * Derives the twin sync sequence entirely from real, already-fetched state --
 * no timers standing in for work. Each step reflects a distinct, independently
 * timed condition rather than a single "loading" flag.
 */
export function useTwinSyncFlags(): TwinSyncFlags {
  const { stream, diagnostics, snapshot } = useAppData();
  return {
    telemetry: stream.status === "open",
    physics: diagnostics.kind === "ok",
    ai: !!snapshot?.analysis,
    health: !!snapshot?.health,
  };
}

export function isSynchronized(flags: TwinSyncFlags): boolean {
  return flags.telemetry && flags.physics && flags.ai && flags.health;
}

export function TwinSyncSequence({ flags, justSynchronized }: { flags: TwinSyncFlags; justSynchronized: boolean }) {
  if (justSynchronized) {
    return (
      <div className="twin-sync done">
        <span className="twin-sync-dot" />
        TWIN SYNCHRONIZED
      </div>
    );
  }

  return (
    <div className="twin-sync">
      {STEPS.map((step) => (
        <span key={step.id} className={`twin-sync-step ${flags[step.id] ? "ok" : ""}`}>
          {step.label}
          {flags[step.id] ? " ✓" : ""}
        </span>
      ))}
    </div>
  );
}
