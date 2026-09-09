package com.aerotwin.controller;

import com.aerotwin.model.mission.MissionProfile;
import com.aerotwin.model.mission.MissionSimulationRequest;
import com.aerotwin.model.mission.MissionSimulationResult;
import com.aerotwin.model.mission.WhatIfRequest;
import com.aerotwin.model.mission.WhatIfResult;
import com.aerotwin.service.MissionServiceClient;
import com.aerotwin.service.MissionServiceClient.MissionServiceUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Operator-facing mission reliability API.
 *
 * <p>All calculations are delegated to the Python physics service.
 * This controller is transport and error-handling only.
 *
 * <pre>
 *   GET  /api/mission/default-profile  → default 6-phase MALE UAV profile
 *   POST /api/mission/simulate          → full mission trajectory simulation
 *   POST /api/mission/what-if           → baseline vs. scenario comparison
 * </pre>
 */
@RestController
@RequestMapping("/api/mission")
public class MissionController {

    private final MissionServiceClient missionServiceClient;

    public MissionController(MissionServiceClient missionServiceClient) {
        this.missionServiceClient = missionServiceClient;
    }

    @GetMapping("/default-profile")
    public ResponseEntity<?> getDefaultProfile() {
        try {
            MissionProfile profile = missionServiceClient.getDefaultProfile();
            return ResponseEntity.ok(profile);
        } catch (MissionServiceUnavailableException ex) {
            return missionUnavailable(ex);
        }
    }

    @PostMapping("/simulate")
    public ResponseEntity<?> simulate(@RequestBody MissionSimulationRequest request) {
        try {
            MissionSimulationResult result = missionServiceClient.simulateMission(request);
            return ResponseEntity.ok(result);
        } catch (MissionServiceUnavailableException ex) {
            return missionUnavailable(ex);
        }
    }

    @PostMapping("/what-if")
    public ResponseEntity<?> whatIf(@RequestBody WhatIfRequest request) {
        try {
            WhatIfResult result = missionServiceClient.runWhatIf(request);
            return ResponseEntity.ok(result);
        } catch (MissionServiceUnavailableException ex) {
            return missionUnavailable(ex);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private ResponseEntity<Map<String, String>> missionUnavailable(MissionServiceUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "status", "mission-unavailable",
                        "message", ex.getMessage()
                ));
    }
}
