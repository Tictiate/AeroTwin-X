package com.aerotwin.controller;

import com.aerotwin.model.DegradationState;
import com.aerotwin.service.DegradationServiceClient.DegradationServiceUnavailableException;
import com.aerotwin.service.DiagnosticService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/degradation")
public class DegradationController {

    private final DiagnosticService diagnosticService;

    public DegradationController(DiagnosticService diagnosticService) {
        this.diagnosticService = diagnosticService;
    }

    @GetMapping("/current")
    public ResponseEntity<?> getCurrentDegradation() {
        try {
            return ResponseEntity.ok(diagnosticService.getCurrentDiagnostics().degradation());
        } catch (DegradationServiceUnavailableException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "degradation-unavailable", "message", exception.getMessage()));
        }
    }
}