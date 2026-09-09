package com.aerotwin.controller;

import com.aerotwin.service.DegradationServiceClient.DegradationServiceUnavailableException;
import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.HealthServiceClient.HealthServiceUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/rul")
public class RulController {

    private final DiagnosticService diagnosticService;

    public RulController(DiagnosticService diagnosticService) {
        this.diagnosticService = diagnosticService;
    }

    @GetMapping("/current")
    public ResponseEntity<?> getCurrentRul() {
        try {
            return ResponseEntity.ok(diagnosticService.getCurrentDiagnostics().rul());
        } catch (DegradationServiceUnavailableException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "degradation-unavailable", "message", exception.getMessage()));
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