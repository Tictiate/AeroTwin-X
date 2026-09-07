package com.aerotwin.service;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.HealthResult;
import com.aerotwin.model.TwinSnapshot;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;

@Service
public class DiagnosticService {

    private final TwinService twinService;
    private final MLServiceClient mlServiceClient;
    private final HealthServiceClient healthServiceClient;
    private final DegradationServiceClient degradationServiceClient;
    private final Deque<DiagnosticSnapshot> history = new ArrayDeque<>();

    public DiagnosticService(TwinService twinService, MLServiceClient mlServiceClient,
                             HealthServiceClient healthServiceClient,
                             DegradationServiceClient degradationServiceClient) {
        this.twinService = twinService;
        this.mlServiceClient = mlServiceClient;
        this.healthServiceClient = healthServiceClient;
        this.degradationServiceClient = degradationServiceClient;
    }

    public DiagnosticSnapshot getCurrentDiagnostics() {
        TwinSnapshot twinSnapshot = twinService.getCurrentTwin();
        DiagnosticSnapshot base = new DiagnosticSnapshot(
                twinSnapshot.telemetry(),
                twinSnapshot.prediction(),
                twinSnapshot.residuals(),
                mlServiceClient.analyze(twinSnapshot)
        );
        HealthResult health = healthServiceClient.evaluate(base, new ArrayList<>(history));
        DiagnosticSnapshot healthSnapshot = new DiagnosticSnapshot(base.telemetry(), base.physicsPrediction(),
            base.residuals(), base.analysis(), health);
        DegradationServiceClient.DegradationResponse degradation = degradationServiceClient.evaluate(
            healthSnapshot, new ArrayList<>(history));
        DiagnosticSnapshot complete = new DiagnosticSnapshot(
            base.telemetry(), base.physicsPrediction(), base.residuals(), base.analysis(), health,
            degradation.degradation(), degradation.rul());
        history.addLast(complete);
        while (history.size() > 60) {
            history.removeFirst();
        }
        return complete;
    }
}