package com.aerotwin.controller;

import com.aerotwin.model.DegradationState;
import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.RulEstimate;
import com.aerotwin.model.Telemetry;
import com.aerotwin.service.DiagnosticService;
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

@WebMvcTest(RulController.class)
class RulControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DiagnosticService diagnosticService;

    @Test
    void returnsCurrentRul() throws Exception {
        when(diagnosticService.getCurrentDiagnostics()).thenReturn(snapshot());

        mockMvc.perform(get("/api/rul/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rulHours").value(15.0))
                .andExpect(jsonPath("$.status").value("ESTIMATED"));
    }

    private DiagnosticSnapshot snapshot() {
        Telemetry telemetry = new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
        PhysicsPrediction prediction = new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
        PhysicsResidual residual = new PhysicsResidual(telemetry.timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        return new DiagnosticSnapshot(telemetry, prediction, residual,
                new MLAnalysis(false, 0.05, "NORMAL", Map.of("NORMAL", 1.0), "phase4-v1"),
                null, new DegradationState("2026-01-01T00:00:00Z", "ENG-1", 80.0, 0.2,
                        Map.of("combustion", 0.3), 0.0, 2.0, "INJECTOR_DEGRADATION",
                        "DEGRADING", 0.8, "HIGH", 10),
                new RulEstimate(15.0, 10.0, 20.0, 0.8, "ESTIMATED", 50.0, 2.0, "Prototype estimate"));
    }
}