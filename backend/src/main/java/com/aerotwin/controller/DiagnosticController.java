package com.aerotwin.controller;

import com.aerotwin.model.TwinSnapshot;
import com.aerotwin.service.DegradationServiceClient.DegradationServiceUnavailableException;
import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.MLServiceClient.MLServiceUnavailableException;
import com.aerotwin.service.HealthServiceClient.HealthServiceUnavailableException;
import com.aerotwin.service.PhysicsServiceClient.PhysicsServiceUnavailableException;
import com.aerotwin.service.TwinService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/diagnostics")
public class DiagnosticController {

    private final DiagnosticService diagnosticService;
    private final TwinService twinService;

    public DiagnosticController(DiagnosticService diagnosticService, TwinService twinService) {
        this.diagnosticService = diagnosticService;
        this.twinService = twinService;
    }

    @GetMapping("/current")
    public ResponseEntity<?> getCurrentDiagnostics() {
        try {
            return ResponseEntity.ok(diagnosticService.getCurrentDiagnostics());
        } catch (DegradationServiceUnavailableException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "degradation-unavailable", "message", exception.getMessage()));
        } catch (MLServiceUnavailableException exception) {
            TwinSnapshot snapshot = exception.twinSnapshot();
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "status", "ml-unavailable",
                            "message", exception.getMessage(),
                            "telemetry", snapshot.telemetry(),
                            "physicsPrediction", snapshot.prediction(),
                            "residuals", snapshot.residuals()
                    ));
                } catch (HealthServiceUnavailableException exception) {
                    var snapshot = exception.snapshot();
                    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(Map.of(
                            "status", "health-unavailable",
                            "message", exception.getMessage(),
                            "telemetry", snapshot.telemetry(),
                            "physicsPrediction", snapshot.physicsPrediction(),
                            "residuals", snapshot.residuals(),
                            "analysis", snapshot.analysis()
                        ));
        } catch (PhysicsServiceUnavailableException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "status", "physics-unavailable",
                            "message", exception.getMessage(),
                            "telemetry", twinService.getCurrentTelemetry()
                    ));
        }
    }
}