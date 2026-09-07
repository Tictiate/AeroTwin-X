package com.aerotwin.controller;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.MLServiceClient.MLServiceUnavailableException;
import com.aerotwin.service.TwinService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DiagnosticController.class)
class DiagnosticControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DiagnosticService diagnosticService;

    @MockBean
    private TwinService twinService;

    @Test
    void returnsIntegratedDiagnostics() throws Exception {
        DiagnosticSnapshot diagnostics = new DiagnosticSnapshot(
                snapshot().telemetry(), snapshot().prediction(), snapshot().residuals(),
                new MLAnalysis(true, 0.82, "MISFIRE", Map.of("MISFIRE", 0.9), "phase4-v1"));
        when(diagnosticService.getCurrentDiagnostics()).thenReturn(diagnostics);

        mockMvc.perform(get("/api/diagnostics/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.analysis.anomaly").value(true))
                .andExpect(jsonPath("$.analysis.predictedFault").value("MISFIRE"))
                .andExpect(jsonPath("$.physicsPrediction.expectedRpm").value(3500.0));
    }

    @Test
    void preservesPhysicsStateWhenMLServiceFails() throws Exception {
        TwinSnapshot twin = snapshot();
        when(diagnosticService.getCurrentDiagnostics())
                .thenThrow(new MLServiceUnavailableException("ML service is unavailable", twin));

        mockMvc.perform(get("/api/diagnostics/current"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("ml-unavailable"))
                .andExpect(jsonPath("$.telemetry.engineId").value("ENG-1"))
                .andExpect(jsonPath("$.physicsPrediction.expectedRpm").value(3500.0));
    }

    private TwinSnapshot snapshot() {
        Telemetry telemetry = new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
        PhysicsPrediction prediction = new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
        PhysicsResidual residual = new PhysicsResidual(telemetry.timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        return new TwinSnapshot(telemetry, prediction, residual);
    }
}