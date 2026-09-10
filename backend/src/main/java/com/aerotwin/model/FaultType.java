package com.aerotwin.model;

/**
 * Mirrors physics-service's app.simulation.fault_models.FaultType exactly.
 * NORMAL means no fault is active (healthy).
 */
public enum FaultType {
    NORMAL,
    INJECTOR_DEGRADATION,
    LUBRICATION_DEGRADATION,
    MISFIRE,
    SENSOR_DRIFT
}
