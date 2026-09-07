package com.aerotwin.controller;

import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.Telemetry;
import com.aerotwin.service.SimulationService;
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

@WebMvcTest(TelemetryController.class)
class TelemetryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SimulationService simulationService;

    @Test
    void getCurrentTelemetry_ShouldReturnTelemetry() throws Exception {
        Telemetry mockTelemetry = new Telemetry(
                Instant.now(), "ENG-1", "MSN-1", MissionPhase.CRUISE,
                5000.0, 10.0, 0.75, 0.6, 4500.0,
                700.0, 180.0, 95.0, 350.0, 15.0, 2.5, 14.2
        );

        when(simulationService.getLatestTelemetry()).thenReturn(mockTelemetry);

        mockMvc.perform(get("/api/telemetry/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.engineId").value("ENG-1"))
                .andExpect(jsonPath("$.missionPhase").value("CRUISE"));
    }
}
