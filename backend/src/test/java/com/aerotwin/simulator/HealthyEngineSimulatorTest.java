package com.aerotwin.simulator;

import com.aerotwin.model.Telemetry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class HealthyEngineSimulatorTest {

    @Test
    void testGenerateNextTick_withinReasonableBounds() {
        HealthyEngineSimulator simulator = new HealthyEngineSimulator();
        SimulationState state = new SimulationState();
        state.setThrottle(0.8);
        state.setLoad(0.7);

        Telemetry telemetry = simulator.generateNextTick(state, "ENG-TEST", "MSN-TEST");

        assertNotNull(telemetry);
        assertEquals("ENG-TEST", telemetry.engineId());
        
        // RPM bounds
        assertTrue(telemetry.rpm() > 900 && telemetry.rpm() < 6100, "RPM out of bounds: " + telemetry.rpm());
        
        // EGT and CHT shouldn't be zero
        assertTrue(telemetry.egt() > 0, "EGT should be positive");
        assertTrue(telemetry.cht() > 0, "CHT should be positive");
    }

    @Test
    void testGenerateNextTick_isDeterministicForSameSimulationState() {
        SimulationState firstState = new SimulationState();
        firstState.setThrottle(0.8);
        firstState.setLoad(0.7);
        firstState.advanceTime(12.0);

        SimulationState secondState = new SimulationState();
        secondState.setThrottle(0.8);
        secondState.setLoad(0.7);
        secondState.advanceTime(12.0);

        Telemetry first = new HealthyEngineSimulator().generateNextTick(firstState, "ENG-1", "MSN-1");
        Telemetry second = new HealthyEngineSimulator().generateNextTick(secondState, "ENG-1", "MSN-1");

        assertEquals(first.rpm(), second.rpm());
        assertEquals(first.egt(), second.egt());
        assertEquals(first.cht(), second.cht());
        assertEquals(first.oilTemperature(), second.oilTemperature());
        assertEquals(first.oilPressure(), second.oilPressure());
        assertEquals(first.fuelFlow(), second.fuelFlow());
        assertEquals(first.vibration(), second.vibration());
    }
}
