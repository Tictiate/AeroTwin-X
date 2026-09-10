package com.aerotwin.simulator;

import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.Telemetry;
import com.aerotwin.service.PhysicsServiceClient;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * HealthyEngineSimulator no longer computes its own physics — it delegates to the physics
 * service's /physics/predict (the canonical source the offline dataset generator also uses),
 * so these tests exercise the delegation, the CHT/oil-temperature state threading, and the
 * physics-unavailable fallback, using a mocked PhysicsServiceClient rather than a live call.
 * See AEROTWIN_PROJECT_MASTER.md §15.5/FINDING-4 for why this delegation exists.
 */
class HealthyEngineSimulatorTest {

    private PhysicsPrediction prediction(double rpm, double egt, double cht, double oilTemp) {
        return new PhysicsPrediction(rpm, egt, cht, oilTemp, 395.0, 12.0, 6.0, 14.2);
    }

    @Test
    void mapsPredictionFieldsDirectlyOntoTelemetryWithNoAddedComputation() {
        PhysicsServiceClient client = mock(PhysicsServiceClient.class);
        when(client.predict(any())).thenReturn(prediction(4550.0, 962.3, 156.6, 81.6));

        HealthyEngineSimulator simulator = new HealthyEngineSimulator(client);
        SimulationState state = new SimulationState();
        state.setThrottle(0.8);
        state.setLoad(0.7);

        Telemetry telemetry = simulator.generateNextTick(state, "ENG-TEST", "MSN-TEST");

        assertNotNull(telemetry);
        assertEquals("ENG-TEST", telemetry.engineId());
        // Regression guard for FINDING-4: the returned telemetry must be exactly the
        // canonical prediction's fields, not a locally-recomputed/adjusted value. If a
        // future change reintroduces independent Java math here, this assertion catches it.
        assertEquals(4550.0, telemetry.rpm());
        assertEquals(962.3, telemetry.egt());
        assertEquals(156.6, telemetry.cht());
        assertEquals(81.6, telemetry.oilTemperature());
        assertTrue(simulator.isHealthyBaselineFresh());
    }

    @Test
    void sendsCurrentContextAndThreadsPreviousChtAndOilTemperatureForward() {
        PhysicsServiceClient client = mock(PhysicsServiceClient.class);
        when(client.predict(any()))
                .thenReturn(prediction(4550.0, 962.3, 156.6, 81.6))
                .thenReturn(prediction(4550.0, 962.3, 160.0, 82.0));

        HealthyEngineSimulator simulator = new HealthyEngineSimulator(client);
        SimulationState state = new SimulationState();
        state.setThrottle(0.8);
        state.setLoad(0.7);
        state.setAltitude(3000.0);
        state.setAmbientTemperature(10.0);

        simulator.generateNextTick(state, "ENG-1", "MSN-1");
        simulator.generateNextTick(state, "ENG-1", "MSN-1");

        var contextCaptor = org.mockito.ArgumentCaptor.forClass(Telemetry.class);
        verify(client, times(2)).predict(contextCaptor.capture());

        Telemetry firstContext = contextCaptor.getAllValues().get(0);
        Telemetry secondContext = contextCaptor.getAllValues().get(1);

        // First tick seeds from ambient (mirrors the offline generator's own cold-start seed).
        assertEquals(20.0, firstContext.cht()); // ambient(10) + 10
        assertEquals(15.0, firstContext.oilTemperature()); // ambient(10) + 5
        // Second tick's context carries forward the FIRST tick's returned expectedCht/OilTemp,
        // not the second prediction's own values — this is the filter continuity requirement.
        assertEquals(156.6, secondContext.cht());
        assertEquals(81.6, secondContext.oilTemperature());

        // Context always reflects live mission state.
        assertEquals(0.8, firstContext.throttle());
        assertEquals(0.7, firstContext.load());
        assertEquals(3000.0, firstContext.altitude());
        assertEquals(10.0, firstContext.ambientTemperature());
    }

    @Test
    void physicsUnavailableFreezesLastKnownHealthyInsteadOfFabricatingNewPhysics() {
        PhysicsServiceClient client = mock(PhysicsServiceClient.class);
        when(client.predict(any()))
                .thenReturn(prediction(4550.0, 962.3, 156.6, 81.6))
                .thenThrow(new PhysicsServiceClient.PhysicsServiceUnavailableException("down"));

        HealthyEngineSimulator simulator = new HealthyEngineSimulator(client);
        SimulationState state = new SimulationState();
        state.setThrottle(0.8);
        state.setLoad(0.7);

        Telemetry first = simulator.generateNextTick(state, "ENG-1", "MSN-1");
        assertTrue(simulator.isHealthyBaselineFresh());

        Telemetry second = simulator.generateNextTick(state, "ENG-1", "MSN-1");

        assertFalse(simulator.isHealthyBaselineFresh());
        // Frozen: identical physics values to the last successful tick.
        assertEquals(first.rpm(), second.rpm());
        assertEquals(first.egt(), second.egt());
        assertEquals(first.cht(), second.cht());
        assertEquals(first.oilTemperature(), second.oilTemperature());
        // Timestamp still advances, so raw telemetry keeps looking "alive" even though the
        // physics behind it is stale.
        assertTrue(second.timestamp().isAfter(first.timestamp()) || second.timestamp().equals(first.timestamp()));
    }

    @Test
    void physicsUnavailableFromTheVeryFirstTickBootstrapsRatherThanThrowing() {
        PhysicsServiceClient client = mock(PhysicsServiceClient.class);
        when(client.predict(any()))
                .thenThrow(new PhysicsServiceClient.PhysicsServiceUnavailableException("down since startup"));

        HealthyEngineSimulator simulator = new HealthyEngineSimulator(client);
        SimulationState state = new SimulationState();
        state.setThrottle(0.8);
        state.setLoad(0.7);
        state.setAmbientTemperature(15.0);

        Telemetry telemetry = simulator.generateNextTick(state, "ENG-1", "MSN-1");

        assertNotNull(telemetry);
        assertFalse(simulator.isHealthyBaselineFresh());
        // Bootstrap values match the offline generator's own cold-start seed, not an
        // independently-invented Java default.
        assertEquals(1000.0, telemetry.rpm());
        assertEquals(35.0, telemetry.egt()); // ambient(15) + 20
        assertEquals(25.0, telemetry.cht()); // ambient(15) + 10
        assertEquals(20.0, telemetry.oilTemperature()); // ambient(15) + 5
    }

    @Test
    void doesNotThrowWhenPhysicsServiceFails() {
        PhysicsServiceClient client = mock(PhysicsServiceClient.class);
        when(client.predict(any())).thenThrow(new PhysicsServiceClient.PhysicsServiceUnavailableException("down"));

        HealthyEngineSimulator simulator = new HealthyEngineSimulator(client);
        SimulationState state = new SimulationState();

        // Must never throw — this runs inside a ScheduledExecutorService loop where an
        // uncaught exception would silently cancel all future ticks (same hazard already
        // guarded against for fault injection, see SimulationService.tick()).
        assertNotNull(simulator.generateNextTick(state, "ENG-1", "MSN-1"));
    }
}
