package com.aerotwin.service;

import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.TwinSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Objects;

@Service
public class MLServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(MLServiceClient.class);
    private final RestClient restClient;

    public MLServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${ml.service.url:http://localhost:8000}") String mlServiceUrl) {
        this.restClient = restClientBuilder.baseUrl(Objects.requireNonNull(mlServiceUrl)).build();
    }

    public MLAnalysis analyze(TwinSnapshot twinSnapshot) {
        try {
            MLAnalysis analysis = restClient.post()
                    .uri("/ml/analyze")
                    .body(Objects.requireNonNull(twinSnapshot))
                    .retrieve()
                    .body(MLAnalysis.class);
            if (analysis == null) {
                throw new MLServiceUnavailableException("ML service returned an empty analysis", twinSnapshot);
            }
            return analysis;
        } catch (RestClientException exception) {
            LOGGER.warn("ML service unavailable for engine {}: {}",
                    twinSnapshot.telemetry().engineId(), exception.getMessage());
            throw new MLServiceUnavailableException("ML service is unavailable", twinSnapshot, exception);
        }
    }

    public static class MLServiceUnavailableException extends RuntimeException {
        private final TwinSnapshot twinSnapshot;

        public MLServiceUnavailableException(String message, TwinSnapshot twinSnapshot) {
            super(message);
            this.twinSnapshot = twinSnapshot;
        }

        public MLServiceUnavailableException(String message, TwinSnapshot twinSnapshot, Throwable cause) {
            super(message, cause);
            this.twinSnapshot = twinSnapshot;
        }

        public TwinSnapshot twinSnapshot() {
            return twinSnapshot;
        }
    }
}