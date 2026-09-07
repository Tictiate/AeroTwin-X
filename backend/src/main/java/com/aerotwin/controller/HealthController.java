package com.aerotwin.controller;

import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.HealthServiceClient.HealthServiceUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final DiagnosticService diagnosticService;

    public HealthController(DiagnosticService diagnosticService) {
        this.diagnosticService = diagnosticService;
    }

    @GetMapping("/current")
    public ResponseEntity<?> getCurrentHealth() {
        try {
            return ResponseEntity.ok(diagnosticService.getCurrentDiagnostics().health());
        } catch (HealthServiceUnavailableException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "status", "health-unavailable",
                            "message", exception.getMessage(),
                            "telemetry", exception.snapshot().telemetry(),
                            "physicsPrediction", exception.snapshot().physicsPrediction(),
                            "residuals", exception.snapshot().residuals(),
                            "analysis", exception.snapshot().analysis()
                    ));
        }
    }
}