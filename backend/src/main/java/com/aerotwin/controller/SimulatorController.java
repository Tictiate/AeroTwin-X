package com.aerotwin.controller;

import com.aerotwin.model.FaultControlRequest;
import com.aerotwin.model.FaultType;
import com.aerotwin.model.SimulatorFaultState;
import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.SimulationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Live fault-injection control for the demo simulator.
 *
 * <p>This is transport/orchestration only: all fault semantics (onset, ramp, per-fault
 * telemetry perturbation) live in the physics service's existing, validated fault models,
 * reached via {@link com.aerotwin.service.FaultInjectionServiceClient}. Activating or
 * resetting a fault also clears the rolling diagnostic history so health/degradation/RUL
 * trends reflect only the current fault state, not a blend of before-and-after samples.
 *
 * <pre>
 *   GET  /api/simulator/fault  → current simulator fault state
 *   POST /api/simulator/fault  → activate a fault, or reset to healthy with faultType=NORMAL
 * </pre>
 */
@RestController
@RequestMapping("/api/simulator")
public class SimulatorController {

    private final SimulationService simulationService;
    private final DiagnosticService diagnosticService;

    public SimulatorController(SimulationService simulationService, DiagnosticService diagnosticService) {
        this.simulationService = simulationService;
        this.diagnosticService = diagnosticService;
    }

    @GetMapping("/fault")
    public SimulatorFaultState getFaultState() {
        return simulationService.getFaultState();
    }

    @PostMapping("/fault")
    public SimulatorFaultState setFault(@RequestBody FaultControlRequest request) {
        FaultType faultType = request.faultType() == null ? FaultType.NORMAL : request.faultType();
        SimulatorFaultState state = faultType == FaultType.NORMAL
                ? simulationService.resetToHealthy()
                : simulationService.activateFault(faultType, request.severity());
        diagnosticService.resetHistory();
        return state;
    }
}
