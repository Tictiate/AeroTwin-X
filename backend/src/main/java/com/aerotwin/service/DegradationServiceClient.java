package com.aerotwin.service;

import com.aerotwin.model.DegradationState;
import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.RulEstimate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class DegradationServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(DegradationServiceClient.class);
    private final RestClient restClient;

    public DegradationServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${degradation.service.url:http://localhost:8000}") String serviceUrl) {
        this.restClient = restClientBuilder.baseUrl(Objects.requireNonNull(serviceUrl)).build();
    }

    public DegradationResponse evaluate(DiagnosticSnapshot current, List<DiagnosticSnapshot> history) {
        try {
            DegradationResponse response = restClient.post()
                    .uri("/degradation/evaluate")
                    .body(Objects.requireNonNull(Map.of("current", current, "history", history)))
                    .retrieve()
                    .body(DegradationResponse.class);
            if (response == null) {
                throw new DegradationServiceUnavailableException("Degradation service returned an empty result", current);
            }
            return response;
        } catch (RestClientException exception) {
            LOGGER.warn("Degradation service unavailable for engine {}: {}",
                    current.telemetry().engineId(), exception.getMessage());
            throw new DegradationServiceUnavailableException("Degradation service is unavailable", current, exception);
        }
    }

    public record DegradationResponse(DegradationState degradation, RulEstimate rul) {}

    public static class DegradationServiceUnavailableException extends RuntimeException {
        private final DiagnosticSnapshot snapshot;

        public DegradationServiceUnavailableException(String message, DiagnosticSnapshot snapshot) {
            super(message);
            this.snapshot = snapshot;
        }

        public DegradationServiceUnavailableException(String message, DiagnosticSnapshot snapshot, Throwable cause) {
            super(message, cause);
            this.snapshot = snapshot;
        }

        public DiagnosticSnapshot snapshot() {
            return snapshot;
        }
    }
}
