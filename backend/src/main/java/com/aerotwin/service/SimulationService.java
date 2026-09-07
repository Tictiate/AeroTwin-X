package com.aerotwin.service;

import com.aerotwin.model.Telemetry;
import com.aerotwin.simulator.EngineSimulator;
import com.aerotwin.simulator.SimulationState;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicReference;

@Service
public class SimulationService {

    private final EngineSimulator simulator;
    private final SimulationState currentState;
    
    // Cache the latest generated telemetry
    private final AtomicReference<Telemetry> latestTelemetry = new AtomicReference<>();

    public SimulationService(EngineSimulator simulator) {
        this.simulator = simulator;
        this.currentState = new SimulationState();
        // Initialize with default values
        this.currentState.setThrottle(0.8);
        this.currentState.setLoad(0.7);
    }

    /**
     * Ticks the simulator. This can be called by a scheduled task.
     */
    public void tick() {
        currentState.advanceTime(1.0);
        Telemetry telemetry = simulator.generateNextTick(currentState, "ENG-001", "MSN-A23");
        latestTelemetry.set(telemetry);
    }

    /**
     * Get the current state configuration to modify it via other APIs if needed.
     */
    public SimulationState getCurrentState() {
        return currentState;
    }

    /**
     * Get the latest telemetry sample.
     */
    public Telemetry getLatestTelemetry() {
        // If not ticked yet, generate one right away
        if (latestTelemetry.get() == null) {
            tick();
        }
        return latestTelemetry.get();
    }
}
