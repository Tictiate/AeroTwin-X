package com.aerotwin.service;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.HealthResult;
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
public class HealthServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(HealthServiceClient.class);
    private final RestClient restClient;

    public HealthServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${health.service.url:http://localhost:8000}") String healthServiceUrl) {
        this.restClient = restClientBuilder.baseUrl(Objects.requireNonNull(healthServiceUrl)).build();
    }

    public HealthResult evaluate(DiagnosticSnapshot current, List<DiagnosticSnapshot> history) {
        try {
            HealthResult result = restClient.post()
                    .uri("/health/evaluate")
                    .body(Objects.requireNonNull(Map.of("current", current, "history", history)))
                    .retrieve()
                    .body(HealthResult.class);
            if (result == null) {
                throw new HealthServiceUnavailableException("Health service returned an empty result", current);
            }
            return result;
        } catch (RestClientException exception) {
            LOGGER.warn("Health service unavailable for engine {}: {}",
                    current.telemetry().engineId(), exception.getMessage());
            throw new HealthServiceUnavailableException("Health service is unavailable", current, exception);
        }
    }

    public static class HealthServiceUnavailableException extends RuntimeException {
        private final DiagnosticSnapshot snapshot;

        public HealthServiceUnavailableException(String message, DiagnosticSnapshot snapshot) {
            super(message);
            this.snapshot = snapshot;
        }

        public HealthServiceUnavailableException(String message, DiagnosticSnapshot snapshot, Throwable cause) {
            super(message, cause);
            this.snapshot = snapshot;
        }

        public DiagnosticSnapshot snapshot() {
            return snapshot;
        }
    }
}
