package com.aerotwin.service;

import com.aerotwin.model.FaultType;
import com.aerotwin.model.Telemetry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Calls the physics service's /simulation/inject-fault endpoint, which applies the existing,
 * validated fault models (app.simulation.fault_models) to Java-generated healthy telemetry.
 * This client does not implement any fault semantics itself — it is transport only.
 */
@Service
public class FaultInjectionServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(FaultInjectionServiceClient.class);
    private final RestClient restClient;

    public FaultInjectionServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${physics.service.url:http://localhost:8000}") String physicsServiceUrl) {
        this.restClient = restClientBuilder.baseUrl(physicsServiceUrl).build();
    }

    public Telemetry injectFault(
            Telemetry healthyTelemetry, FaultType faultType, double elapsedFaultSeconds, Double severity) {
        try {
            FaultInjectionResponse response = restClient.post()
                    .uri("/simulation/inject-fault")
                    .body(new FaultInjectionRequest(healthyTelemetry, faultType, elapsedFaultSeconds, severity, 42))
                    .retrieve()
                    .body(FaultInjectionResponse.class);
            if (response == null) {
                throw new FaultInjectionServiceUnavailableException("Fault injection service returned an empty result");
            }
            return response.telemetry();
        } catch (RestClientException exception) {
            LOGGER.warn("Fault injection service unavailable for engine {}: {}",
                    healthyTelemetry.engineId(), exception.getMessage());
            throw new FaultInjectionServiceUnavailableException("Fault injection service is unavailable", exception);
        }
    }

    private record FaultInjectionRequest(
            Telemetry telemetry,
            FaultType faultType,
            double elapsedFaultSeconds,
            Double severity,
            int seed
    ) {
    }

    private record FaultInjectionResponse(
            Telemetry telemetry,
            FaultType faultType,
            double severity,
            boolean active
    ) {
    }

    public static class FaultInjectionServiceUnavailableException extends RuntimeException {
        public FaultInjectionServiceUnavailableException(String message) {
            super(message);
        }

        public FaultInjectionServiceUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
