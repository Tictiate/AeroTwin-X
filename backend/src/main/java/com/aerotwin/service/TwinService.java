package com.aerotwin.service;

import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import org.springframework.stereotype.Service;

@Service
public class TwinService {

    private final SimulationService simulationService;
    private final PhysicsServiceClient physicsServiceClient;
    private final ResidualService residualService;

    public TwinService(SimulationService simulationService, PhysicsServiceClient physicsServiceClient,
                       ResidualService residualService) {
        this.simulationService = simulationService;
        this.physicsServiceClient = physicsServiceClient;
        this.residualService = residualService;
    }

    public TwinSnapshot getCurrentTwin() {
        Telemetry telemetry = getCurrentTelemetry();
        PhysicsPrediction prediction = physicsServiceClient.predict(telemetry);
        PhysicsResidual residuals = residualService.calculate(telemetry, prediction);
        return new TwinSnapshot(telemetry, prediction, residuals);
    }

    public Telemetry getCurrentTelemetry() {
        return simulationService.getLatestTelemetry();
    }
}