package com.aerotwin.controller;

import com.aerotwin.model.TwinSnapshot;
import com.aerotwin.service.PhysicsServiceClient.PhysicsServiceUnavailableException;
import com.aerotwin.service.TwinService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/twin")
public class TwinController {

    private final TwinService twinService;

    public TwinController(TwinService twinService) {
        this.twinService = twinService;
    }

    @GetMapping("/current")
    public ResponseEntity<?> getCurrentTwin() {
        try {
            TwinSnapshot snapshot = twinService.getCurrentTwin();
            return ResponseEntity.ok(snapshot);
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