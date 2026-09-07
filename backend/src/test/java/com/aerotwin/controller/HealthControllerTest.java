package com.aerotwin.controller;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.HealthResult;
import com.aerotwin.model.HealthTrend;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.SensorHealthResult;
import com.aerotwin.model.Telemetry;
import com.aerotwin.service.DiagnosticService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(HealthController.class)
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DiagnosticService diagnosticService;

    @Test
    void returnsCurrentHealth() throws Exception {
        when(diagnosticService.getCurrentDiagnostics()).thenReturn(new DiagnosticSnapshot(
                telemetry(), prediction(), residuals(), analysis(), new HealthResult(
                        88.0, "CAUTION", Map.of("thermal", 90.0),
                        new HealthTrend("STABLE", 0.0),
                        Map.of("cht", new SensorHealthResult(95.0, "HEALTHY", 0.1, "Normal")),
                        List.of(), "NORMAL", null, null, 0.9)));

        mockMvc.perform(get("/api/health/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallHealth").value(88.0))
                .andExpect(jsonPath("$.status").value("CAUTION"));
    }

    private Telemetry telemetry() {
        return new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }

    private PhysicsPrediction prediction() {
        return new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }

    private PhysicsResidual residuals() {
        return new PhysicsResidual(telemetry().timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    }

    private MLAnalysis analysis() {
        return new MLAnalysis(false, 0.05, "NORMAL", Map.of("NORMAL", 1.0), "phase4-v1");
    }
}