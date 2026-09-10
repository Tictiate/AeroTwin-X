package com.aerotwin.controller;

import com.aerotwin.model.FaultType;
import com.aerotwin.model.SimulatorFaultState;
import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.SimulationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SimulatorController.class)
class SimulatorControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SimulationService simulationService;

    @MockBean
    private DiagnosticService diagnosticService;

    @Test
    void getFaultState_returnsCurrentState() throws Exception {
        when(simulationService.getFaultState())
                .thenReturn(new SimulatorFaultState(FaultType.NORMAL, null, 0.0, false, true));

        mockMvc.perform(get("/api/simulator/fault"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faultType").value("NORMAL"))
                .andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void postFault_activatesRequestedFaultAndResetsHistory() throws Exception {
        when(simulationService.activateFault(FaultType.INJECTOR_DEGRADATION, null))
                .thenReturn(new SimulatorFaultState(FaultType.INJECTOR_DEGRADATION, null, 0.0, true, true));

        mockMvc.perform(post("/api/simulator/fault")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"faultType\":\"INJECTOR_DEGRADATION\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faultType").value("INJECTOR_DEGRADATION"))
                .andExpect(jsonPath("$.active").value(true));

        verify(simulationService, times(1)).activateFault(FaultType.INJECTOR_DEGRADATION, null);
        verify(diagnosticService, times(1)).resetHistory();
    }

    @Test
    void postFault_withSeverity_passesSeverityThrough() throws Exception {
        when(simulationService.activateFault(eq(FaultType.MISFIRE), eq(0.75)))
                .thenReturn(new SimulatorFaultState(FaultType.MISFIRE, 0.75, 0.0, true, true));

        mockMvc.perform(post("/api/simulator/fault")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"faultType\":\"MISFIRE\",\"severity\":0.75}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.severityOverride").value(0.75));
    }

    @Test
    void postFault_withNormal_resetsToHealthyInsteadOfActivating() throws Exception {
        when(simulationService.resetToHealthy())
                .thenReturn(new SimulatorFaultState(FaultType.NORMAL, null, 0.0, false, true));

        mockMvc.perform(post("/api/simulator/fault")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"faultType\":\"NORMAL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faultType").value("NORMAL"))
                .andExpect(jsonPath("$.active").value(false));

        verify(simulationService, times(1)).resetToHealthy();
        verify(diagnosticService, times(1)).resetHistory();
    }

    @Test
    void postFault_withMissingFaultType_treatedAsReset() throws Exception {
        when(simulationService.resetToHealthy())
                .thenReturn(new SimulatorFaultState(FaultType.NORMAL, null, 0.0, false, true));

        mockMvc.perform(post("/api/simulator/fault")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faultType").value("NORMAL"));

        verify(simulationService, times(1)).resetToHealthy();
    }

    @Test
    void getFaultState_surfacesStalePhysicsBaseline() throws Exception {
        when(simulationService.getFaultState())
                .thenReturn(new SimulatorFaultState(FaultType.NORMAL, null, 5.0, false, false));

        mockMvc.perform(get("/api/simulator/fault"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.healthyBaselineFresh").value(false));
    }

    @Test
    void postFault_withInvalidFaultType_rejectedAsBadRequest() throws Exception {
        mockMvc.perform(post("/api/simulator/fault")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"faultType\":\"NOT_A_REAL_FAULT\"}"))
                .andExpect(status().isBadRequest());
    }
}
