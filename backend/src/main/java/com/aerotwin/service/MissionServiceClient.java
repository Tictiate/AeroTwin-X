package com.aerotwin.service;

import com.aerotwin.model.mission.MissionProfile;
import com.aerotwin.model.mission.MissionSimulationRequest;
import com.aerotwin.model.mission.MissionSimulationResult;
import com.aerotwin.model.mission.WhatIfRequest;
import com.aerotwin.model.mission.WhatIfResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Objects;

/**
 * HTTP client that delegates mission simulation and what-if evaluation to the Python physics service.
 * All mission calculations occur in Python; this client is transport only.
 */
@Service
public class MissionServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(MissionServiceClient.class);
    private final RestClient restClient;

    public MissionServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${ml.service.url:http://localhost:8000}") String mlServiceUrl) {
        this.restClient = restClientBuilder.baseUrl(Objects.requireNonNull(mlServiceUrl)).build();
    }

    /** Retrieve the default 6-phase MALE UAV mission profile from the Python service. */
    public MissionProfile getDefaultProfile() {
        try {
            MissionProfile profile = restClient.get()
                    .uri("/mission/default-profile")
                    .retrieve()
                    .body(MissionProfile.class);
            if (profile == null) {
                throw new MissionServiceUnavailableException("Mission service returned an empty profile");
            }
            return profile;
        } catch (RestClientException ex) {
            LOGGER.warn("Mission service unavailable (default-profile): {}", ex.getMessage());
            throw new MissionServiceUnavailableException("Mission service is unavailable", ex);
        }
    }

    /** Run a full mission trajectory simulation against the Python physics service. */
    public MissionSimulationResult simulateMission(MissionSimulationRequest request) {
        try {
            MissionSimulationResult result = restClient.post()
                    .uri("/mission/simulate")
                    .body(Objects.requireNonNull(request))
                    .retrieve()
                    .body(MissionSimulationResult.class);
            if (result == null) {
                throw new MissionServiceUnavailableException("Mission service returned an empty simulation result");
            }
            LOGGER.debug("Mission simulation complete: missionId={} risk={} band={}",
                    result.missionId(), result.missionRiskScore(), result.riskBand());
            return result;
        } catch (RestClientException ex) {
            LOGGER.warn("Mission service unavailable (simulate): {}", ex.getMessage());
            throw new MissionServiceUnavailableException("Mission service is unavailable", ex);
        }
    }

    /** Run a baseline vs. what-if scenario comparison via the Python physics service. */
    public WhatIfResult runWhatIf(WhatIfRequest request) {
        try {
            WhatIfResult result = restClient.post()
                    .uri("/mission/what-if")
                    .body(Objects.requireNonNull(request))
                    .retrieve()
                    .body(WhatIfResult.class);
            if (result == null) {
                throw new MissionServiceUnavailableException("Mission service returned an empty what-if result");
            }
            LOGGER.debug("What-if simulation complete: riskDelta={} interpretation={}",
                    result.delta().risk(), result.interpretation());
            return result;
        } catch (RestClientException ex) {
            LOGGER.warn("Mission service unavailable (what-if): {}", ex.getMessage());
            throw new MissionServiceUnavailableException("Mission service is unavailable", ex);
        }
    }

    // ── Exception ──────────────────────────────────────────────────────────────

    public static class MissionServiceUnavailableException extends RuntimeException {
        public MissionServiceUnavailableException(String message) {
            super(message);
        }

        public MissionServiceUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
