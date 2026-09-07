package com.aerotwin.controller;

import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import com.aerotwin.service.PhysicsServiceClient.PhysicsServiceUnavailableException;
import com.aerotwin.service.TwinService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TwinController.class)
class TwinControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TwinService twinService;

    @Test
    void returnsActualExpectedAndResiduals() throws Exception {
        when(twinService.getCurrentTwin()).thenReturn(snapshot());

        mockMvc.perform(get("/api/twin/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.telemetry.engineId").value("ENG-1"))
                .andExpect(jsonPath("$.prediction.expectedRpm").value(100.0))
                .andExpect(jsonPath("$.residuals.rpmResidual").value(5.0));
    }

    @Test
    void returnsServiceUnavailableWhenPhysicsServiceFails() throws Exception {
        when(twinService.getCurrentTelemetry()).thenReturn(snapshot().telemetry());
        when(twinService.getCurrentTwin())
                .thenThrow(new PhysicsServiceUnavailableException("Physics service is unavailable"));

        mockMvc.perform(get("/api/twin/current"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("physics-unavailable"))
                .andExpect(jsonPath("$.telemetry.engineId").value("ENG-1"));
    }

    private TwinSnapshot snapshot() {
        Telemetry telemetry = new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 105.0, 101.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
        PhysicsPrediction prediction = new PhysicsPrediction(100.0, 100.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
        PhysicsResidual residual = new PhysicsResidual(telemetry.timestamp(), "ENG-1", "MSN-1",
                5.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.05, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0);
        return new TwinSnapshot(telemetry, prediction, residual);
    }
}