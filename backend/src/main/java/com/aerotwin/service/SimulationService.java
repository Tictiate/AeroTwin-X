package com.aerotwin.service;

import com.aerotwin.model.FaultType;
import com.aerotwin.model.SimulatorFaultState;
import com.aerotwin.model.Telemetry;
import com.aerotwin.simulator.EngineSimulator;
import com.aerotwin.simulator.SimulationState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicReference;

@Service
public class SimulationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SimulationService.class);

    private final EngineSimulator simulator;
    private final FaultInjectionServiceClient faultInjectionServiceClient;
    private final SimulationState currentState;

    // Cache the latest generated telemetry
    private final AtomicReference<Telemetry> latestTelemetry = new AtomicReference<>();

    public SimulationService(EngineSimulator simulator, FaultInjectionServiceClient faultInjectionServiceClient) {
        this.simulator = simulator;
        this.faultInjectionServiceClient = faultInjectionServiceClient;
        this.currentState = new SimulationState();
        // Initialize with default values
        this.currentState.setThrottle(0.8);
        this.currentState.setLoad(0.7);
    }

    /**
     * Ticks the simulator. This can be called by a scheduled task.
     *
     * <p>When a fault is active, the healthy tick is passed through the fault-injection
     * service to get real, fault-perturbed telemetry. A failure of that call (physics
     * service down) falls back to healthy telemetry for this tick rather than propagating
     * an exception — this method runs inside a {@code ScheduledExecutorService}, and an
     * uncaught exception there would silently cancel all future scheduled ticks, killing
     * the entire live telemetry stream.
     */
    public void tick() {
        currentState.advanceTime(1.0);
        Telemetry healthy = simulator.generateNextTick(currentState, "ENG-001", "MSN-A23");

        Telemetry effective = healthy;
        FaultType activeFault = currentState.getActiveFaultType();
        if (activeFault != null && activeFault != FaultType.NORMAL) {
            try {
                effective = faultInjectionServiceClient.injectFault(
                        healthy, activeFault, currentState.getElapsedFaultSeconds(), currentState.getFaultSeverityOverride());
            } catch (FaultInjectionServiceClient.FaultInjectionServiceUnavailableException exception) {
                LOGGER.warn("Fault injection unavailable this tick; falling back to healthy telemetry: {}",
                        exception.getMessage());
                effective = healthy;
            }
        }

        latestTelemetry.set(effective);
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

    public SimulatorFaultState activateFault(FaultType faultType, Double severity) {
        currentState.activateFault(faultType, severity);
        return getFaultState();
    }

    public SimulatorFaultState resetToHealthy() {
        currentState.resetToHealthy();
        return getFaultState();
    }

    public SimulatorFaultState getFaultState() {
        FaultType faultType = currentState.getActiveFaultType();
        return new SimulatorFaultState(
                faultType,
                currentState.getFaultSeverityOverride(),
                currentState.getElapsedFaultSeconds(),
                faultType != FaultType.NORMAL,
                simulator.isHealthyBaselineFresh()
        );
    }
}
