package com.aerotwin.service;

import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.Telemetry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class PhysicsServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(PhysicsServiceClient.class);

    private final RestClient restClient;

    public PhysicsServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${physics.service.url:http://localhost:8000}") String physicsServiceUrl) {
        this.restClient = restClientBuilder.baseUrl(physicsServiceUrl).build();
    }

    public PhysicsPrediction predict(Telemetry telemetry) {
        long startedAt = System.nanoTime();
        try {
            PhysicsPrediction prediction = restClient.post()
                    .uri("/physics/predict")
                    .body(telemetry)
                    .retrieve()
                    .body(PhysicsPrediction.class);
            if (prediction == null) {
                throw new PhysicsServiceUnavailableException("Physics service returned an empty prediction");
            }
            long elapsedMillis = (System.nanoTime() - startedAt) / 1_000_000;
            LOGGER.debug("Physics prediction completed in {} ms for engine {}", elapsedMillis, telemetry.engineId());
            return prediction;
        } catch (RestClientException exception) {
            LOGGER.warn("Physics service unavailable for engine {}: {}", telemetry.engineId(), exception.getMessage());
            throw new PhysicsServiceUnavailableException("Physics service is unavailable", exception);
        }
    }

    public static class PhysicsServiceUnavailableException extends RuntimeException {
        public PhysicsServiceUnavailableException(String message) {
            super(message);
        }

        public PhysicsServiceUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}