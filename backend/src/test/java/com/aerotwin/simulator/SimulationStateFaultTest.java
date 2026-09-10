package com.aerotwin.simulator;

import com.aerotwin.model.FaultType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SimulationStateFaultTest {

    @Test
    void defaultsToNormalWithNoSeverityOverride() {
        SimulationState state = new SimulationState();
        assertEquals(FaultType.NORMAL, state.getActiveFaultType());
        assertNull(state.getFaultSeverityOverride());
        assertEquals(0.0, state.getElapsedFaultSeconds());
    }

    @Test
    void activatingAFaultRestartsItsElapsedClockAtZero() {
        SimulationState state = new SimulationState();
        state.advanceTime(500.0);

        state.activateFault(FaultType.INJECTOR_DEGRADATION, null);

        assertEquals(FaultType.INJECTOR_DEGRADATION, state.getActiveFaultType());
        assertEquals(0.0, state.getElapsedFaultSeconds());

        state.advanceTime(30.0);
        assertEquals(30.0, state.getElapsedFaultSeconds());
    }

    @Test
    void resetToHealthyClearsFaultTypeAndSeverity() {
        SimulationState state = new SimulationState();
        state.activateFault(FaultType.MISFIRE, 0.8);
        assertEquals(0.8, state.getFaultSeverityOverride());

        state.resetToHealthy();

        assertEquals(FaultType.NORMAL, state.getActiveFaultType());
        assertNull(state.getFaultSeverityOverride());
    }

    @Test
    void activatingNormalDirectlyDiscardsAnySeverityOverride() {
        SimulationState state = new SimulationState();
        state.activateFault(FaultType.NORMAL, 0.9);
        assertNull(state.getFaultSeverityOverride());
    }

    @Test
    void reactivatingADifferentFaultRestartsTheClockAgain() {
        SimulationState state = new SimulationState();
        state.activateFault(FaultType.LUBRICATION_DEGRADATION, null);
        state.advanceTime(200.0);
        assertEquals(200.0, state.getElapsedFaultSeconds());

        state.activateFault(FaultType.SENSOR_DRIFT, null);
        assertEquals(0.0, state.getElapsedFaultSeconds());
        assertTrue(state.getActiveFaultType() == FaultType.SENSOR_DRIFT);
        assertFalse(state.getActiveFaultType() == FaultType.LUBRICATION_DEGRADATION);
    }
}
