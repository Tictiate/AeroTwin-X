package com.aerotwin.model;

/**
 * Current live-simulator fault state, returned by both GET and POST /api/simulator/fault.
 *
 * @param healthyBaselineFresh whether the most recent tick obtained a fresh healthy baseline
 *        from the physics service, or is reusing a frozen last-known value because the
 *        physics service was unreachable (see HealthyEngineSimulator).
 */
public record SimulatorFaultState(
        FaultType faultType,
        Double severityOverride,
        double elapsedFaultSeconds,
        boolean active,
        boolean healthyBaselineFresh
) {
}
