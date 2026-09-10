package com.aerotwin.service;

import com.aerotwin.model.FaultType;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.SimulatorFaultState;
import com.aerotwin.model.Telemetry;
import com.aerotwin.simulator.EngineSimulator;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SimulationServiceTest {

    private Telemetry healthyTelemetry() {
        return new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-001", "MSN-A23",
                MissionPhase.CRUISE, 0.0, 15.0, 0.8, 0.7, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }

    private Telemetry faultedTelemetry() {
        return new Telemetry(Instant.parse("2026-01-01T00:00:01Z"), "ENG-001", "MSN-A23",
                MissionPhase.CRUISE, 0.0, 15.0, 0.8, 0.7, 3400.0, 590.0,
                144.0, 80.0, 300.0, 12.5, 4.0, 14.2);
    }

    @Test
    void normalStateNeverCallsFaultInjectionService() {
        EngineSimulator simulator = mock(EngineSimulator.class);
        FaultInjectionServiceClient faultClient = mock(FaultInjectionServiceClient.class);
        when(simulator.generateNextTick(any(), anyString(), anyString())).thenReturn(healthyTelemetry());

        SimulationService service = new SimulationService(simulator, faultClient);
        service.tick();

        assertEquals(healthyTelemetry(), service.getLatestTelemetry());
        verifyNoInteractions(faultClient);
    }

    @Test
    void activeFaultCallsInjectionServiceAndUsesItsResult() {
        EngineSimulator simulator = mock(EngineSimulator.class);
        FaultInjectionServiceClient faultClient = mock(FaultInjectionServiceClient.class);
        when(simulator.generateNextTick(any(), anyString(), anyString())).thenReturn(healthyTelemetry());
        when(faultClient.injectFault(any(), any(FaultType.class), anyDouble(), any()))
                .thenReturn(faultedTelemetry());

        SimulationService service = new SimulationService(simulator, faultClient);
        service.activateFault(FaultType.INJECTOR_DEGRADATION, null);
        service.tick();

        assertEquals(faultedTelemetry(), service.getLatestTelemetry());
        verify(faultClient, times(1)).injectFault(any(), any(FaultType.class), anyDouble(), any());
    }

    @Test
    void faultInjectionFailureFallsBackToHealthyTelemetryInsteadOfThrowing() {
        EngineSimulator simulator = mock(EngineSimulator.class);
        FaultInjectionServiceClient faultClient = mock(FaultInjectionServiceClient.class);
        when(simulator.generateNextTick(any(), anyString(), anyString())).thenReturn(healthyTelemetry());
        when(faultClient.injectFault(any(), any(FaultType.class), anyDouble(), any()))
                .thenThrow(new FaultInjectionServiceClient.FaultInjectionServiceUnavailableException("down"));

        SimulationService service = new SimulationService(simulator, faultClient);
        service.activateFault(FaultType.MISFIRE, null);

        // Must not throw, even though the injection call fails every time.
        service.tick();

        assertEquals(healthyTelemetry(), service.getLatestTelemetry());
    }

    @Test
    void resetToHealthyReturnsInactiveState() {
        EngineSimulator simulator = mock(EngineSimulator.class);
        FaultInjectionServiceClient faultClient = mock(FaultInjectionServiceClient.class);

        SimulationService service = new SimulationService(simulator, faultClient);
        service.activateFault(FaultType.SENSOR_DRIFT, 0.5);
        assertTrue(service.getFaultState().active());

        SimulatorFaultState state = service.resetToHealthy();

        assertEquals(FaultType.NORMAL, state.faultType());
        assertFalse(state.active());
    }

    @Test
    void faultStateSurfacesWhetherTheHealthyBaselineIsFresh() {
        EngineSimulator simulator = mock(EngineSimulator.class);
        FaultInjectionServiceClient faultClient = mock(FaultInjectionServiceClient.class);
        when(simulator.isHealthyBaselineFresh()).thenReturn(false);

        SimulationService service = new SimulationService(simulator, faultClient);

        assertFalse(service.getFaultState().healthyBaselineFresh());
    }
}
