package com.aerotwin.controller;

import com.aerotwin.model.Telemetry;
import com.aerotwin.service.SimulationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/telemetry")
public class TelemetryController {

    private final SimulationService simulationService;

    public TelemetryController(SimulationService simulationService) {
        this.simulationService = simulationService;
    }

    @GetMapping("/current")
    public Telemetry getCurrentTelemetry() {
        return simulationService.getLatestTelemetry();
    }
}
