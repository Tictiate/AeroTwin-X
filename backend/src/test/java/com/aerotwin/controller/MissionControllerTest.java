package com.aerotwin.controller;

import com.aerotwin.model.mission.HistoryPoint;
import com.aerotwin.model.mission.HistoryRunDetail;
import com.aerotwin.model.mission.HistoryRunSummary;
import com.aerotwin.model.mission.MissionPhaseResult;
import com.aerotwin.model.mission.MissionPhaseSpec;
import com.aerotwin.model.mission.MissionProfile;
import com.aerotwin.model.mission.MissionSimulationRequest;
import com.aerotwin.model.mission.MissionSimulationResult;
import com.aerotwin.model.mission.WhatIfDelta;
import com.aerotwin.model.mission.WhatIfRequest;
import com.aerotwin.model.mission.WhatIfResult;
import com.aerotwin.model.mission.WhatIfScenario;
import com.aerotwin.service.MissionServiceClient;
import com.aerotwin.service.MissionServiceClient.MissionServiceUnavailableException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MissionController.class)
class MissionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private MissionServiceClient missionServiceClient;

    // ── /api/mission/simulate ──────────────────────────────────────────────────

    @Test
    void simulateMission_returnsResult() throws Exception {
        when(missionServiceClient.simulateMission(any())).thenReturn(sampleSimulationResult());

        MissionSimulationRequest req = new MissionSimulationRequest(sampleProfile());
        mockMvc.perform(post("/api/mission/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.missionId").value("MISSION-TEST-01"))
                .andExpect(jsonPath("$.missionRiskScore").value(0.15))
                .andExpect(jsonPath("$.riskBand").value("LOW"))
                .andExpect(jsonPath("$.criticalPhase").value("TAKEOFF"))
                .andExpect(jsonPath("$.projectedEndHealth").value(92.5))
                .andExpect(jsonPath("$.phaseResults").isArray())
                .andExpect(jsonPath("$.phaseResults[0].phase").value("TAKEOFF"))
                .andExpect(jsonPath("$.missionReliabilityScore").value(0.85));
    }

    @Test
    void simulateMission_whenServiceUnavailable_returns503() throws Exception {
        when(missionServiceClient.simulateMission(any()))
                .thenThrow(new MissionServiceUnavailableException("Mission service is unavailable"));

        MissionSimulationRequest req = new MissionSimulationRequest(sampleProfile());
        mockMvc.perform(post("/api/mission/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("mission-unavailable"))
                .andExpect(jsonPath("$.message").value("Mission service is unavailable"));
    }

    // ── /api/mission/what-if ───────────────────────────────────────────────────

    @Test
    void runWhatIf_returnsResult() throws Exception {
        when(missionServiceClient.runWhatIf(any())).thenReturn(sampleWhatIfResult());

        WhatIfRequest req = new WhatIfRequest(sampleProfile(), new WhatIfScenario(1.5, 0.0, 0.0,
                List.of("CRUISE", "LOITER"), null));
        mockMvc.perform(post("/api/mission/what-if")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baseline.missionRiskScore").value(0.15))
                .andExpect(jsonPath("$.scenario.missionRiskScore").value(0.35))
                .andExpect(jsonPath("$.delta.risk").value(0.20))
                .andExpect(jsonPath("$.delta.endHealth").value(-10.5))
                .andExpect(jsonPath("$.interpretation").exists());
    }

    @Test
    void runWhatIf_whenServiceUnavailable_returns503() throws Exception {
        when(missionServiceClient.runWhatIf(any()))
                .thenThrow(new MissionServiceUnavailableException("Mission service is unavailable"));

        WhatIfRequest req = new WhatIfRequest(sampleProfile(), new WhatIfScenario());
        mockMvc.perform(post("/api/mission/what-if")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("mission-unavailable"));
    }

    // ── /api/mission/default-profile ──────────────────────────────────────────

    @Test
    void getDefaultProfile_returnsProfile() throws Exception {
        when(missionServiceClient.getDefaultProfile()).thenReturn(sampleProfile());

        mockMvc.perform(get("/api/mission/default-profile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.missionId").value("MISSION-TEST-01"))
                .andExpect(jsonPath("$.phases").isArray())
                .andExpect(jsonPath("$.phases[0].phase").value("TAKEOFF"));
    }

    @Test
    void getDefaultProfile_whenServiceUnavailable_returns503() throws Exception {
        when(missionServiceClient.getDefaultProfile())
                .thenThrow(new MissionServiceUnavailableException("Mission service is unavailable"));

        mockMvc.perform(get("/api/mission/default-profile"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("mission-unavailable"));
    }

    // ── /api/mission/history ──────────────────────────────────────────────────

    @Test
    void listHistory_returnsRunSummaries() throws Exception {
        when(missionServiceClient.listHistoryRuns()).thenReturn(List.of(
                new HistoryRunSummary("LUBRICATION_DEGRADATION", "MSN-LUBRICATION_DEGRADATION-000", "ENG-DATASET-000", 1500)
        ));

        mockMvc.perform(get("/api/mission/history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].scenario").value("LUBRICATION_DEGRADATION"))
                .andExpect(jsonPath("$[0].totalSamples").value(1500));
    }

    @Test
    void listHistory_whenServiceUnavailable_returns503() throws Exception {
        when(missionServiceClient.listHistoryRuns())
                .thenThrow(new MissionServiceUnavailableException("Mission service is unavailable"));

        mockMvc.perform(get("/api/mission/history"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("mission-unavailable"));
    }

    @Test
    void getHistoryRun_returnsRunDetail() throws Exception {
        HistoryPoint point = new HistoryPoint(
                "2026-01-01 00:00:01+00:00", 100.0, 0.0, 0.0, "HEALTHY",
                null, null, null, 0.05, "INSUFFICIENT_HISTORY", "NORMAL", null);
        when(missionServiceClient.getHistoryRun("LUBRICATION_DEGRADATION")).thenReturn(
                new HistoryRunDetail("LUBRICATION_DEGRADATION", "MSN-LUBRICATION_DEGRADATION-000",
                        "ENG-DATASET-000", 1500, List.of(point)));

        mockMvc.perform(get("/api/mission/history/LUBRICATION_DEGRADATION"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenario").value("LUBRICATION_DEGRADATION"))
                .andExpect(jsonPath("$.points[0].health").value(100.0))
                .andExpect(jsonPath("$.points[0].rulStatus").value("INSUFFICIENT_HISTORY"));
    }

    // ── Fixtures ───────────────────────────────────────────────────────────────

    private MissionProfile sampleProfile() {
        return new MissionProfile("MISSION-TEST-01", List.of(
                new MissionPhaseSpec("TAKEOFF", 120.0, 0.0, 500.0, 0.90, 0.85, 15.0)
        ));
    }

    private MissionSimulationResult sampleSimulationResult() {
        MissionPhaseResult phaseResult = new MissionPhaseResult(
                "TAKEOFF", 120.0, 96.0, 94.0, 93.5, 2.0, 0.25, "GUARDED");
        return new MissionSimulationResult(
                "MISSION-TEST-01",
                120.0,
                0.15,
                0.85,
                "LOW",
                "MISSION_GO",
                "Mission profile operates well within prototype health and degradation margins.",
                92.5,
                91.0,
                "TAKEOFF",
                null,
                List.of(phaseResult),
                Map.of("thermal", 0.02, "lubrication", 0.01),
                0.0
        );
    }

    private WhatIfResult sampleWhatIfResult() {
        MissionSimulationResult baseline = new MissionSimulationResult(
                "MISSION-TEST-01", 120.0, 0.15, 0.85, "LOW", "MISSION_GO",
                "Within margins.", 92.5, 91.0, "TAKEOFF", null,
                List.of(), Map.of(), 0.0);
        MissionSimulationResult scenario = new MissionSimulationResult(
                "MISSION-TEST-01-WHATIF", 180.0, 0.35, 0.65, "GUARDED", "MISSION_CAUTION",
                "Margins tightened.", 82.0, 79.0, "CRUISE", null,
                List.of(), Map.of(), 0.0);
        return new WhatIfResult(
                baseline, scenario,
                new WhatIfDelta(0.20, -0.20, -10.5, -12.0),
                "Extended cruise duration (1.5x) increases cumulative operating exposure."
        );
    }
}
