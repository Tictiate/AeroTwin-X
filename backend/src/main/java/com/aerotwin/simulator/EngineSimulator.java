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
}
