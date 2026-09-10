package com.aerotwin.simulator;

import com.aerotwin.model.Telemetry;

public interface EngineSimulator {
    /**
     * Generate the next telemetry sample based on the current simulation state.
     * @param state Current mission conditions.
     * @param engineId The ID of the engine.
     * @param missionId The ID of the mission.
     * @return Generated Telemetry.
     */
    Telemetry generateNextTick(SimulationState state, String engineId, String missionId);

    /**
     * Whether the most recent call to {@link #generateNextTick} obtained a fresh healthy
     * baseline, or fell back to a previously-known value because its source of truth was
     * unavailable. Implementations with no external dependency can rely on the default.
     */
    default boolean isHealthyBaselineFresh() {
        return true;
    }
}
