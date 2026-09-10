package com.aerotwin.service;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class MLServiceClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(MLServiceClient.class);
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public MLServiceClient(
            RestClient.Builder restClientBuilder,
            ObjectMapper objectMapper,
            @Value("${ml.service.url:http://localhost:8000}") String mlServiceUrl) {
        this.restClient = restClientBuilder.baseUrl(Objects.requireNonNull(mlServiceUrl)).build();
        this.objectMapper = objectMapper;
    }

    /**
     * Analyzes the current tick, providing prior diagnostic samples as rolling-window context.
     *
     * <p>The Python model's rolling-window features (mean/std/max/slope over a 5-sample window)
     * were trained on properly-windowed offline data; without real history, every live call
     * degenerates to a single-sample window and those features collapse to defaults. {@code
     * history} must contain only samples strictly before this tick (the caller's history buffer
     * before this tick is appended to it), matching how {@link HealthServiceClient} and {@link
     * DegradationServiceClient} already receive prior samples.
     */
    public MLAnalysis analyze(TwinSnapshot twinSnapshot, List<DiagnosticSnapshot> history) {
        try {
            List<Map<String, Object>> historyPayload = history.stream()
                    .map(this::toFlatFeatureRow)
                    .toList();
            MLAnalysis analysis = restClient.post()
                    .uri("/ml/analyze")
                    .body(new MLAnalyzeRequest(
                            twinSnapshot.telemetry(), twinSnapshot.prediction(), twinSnapshot.residuals(),
                            0, historyPayload))
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

    /**
     * Flattens a historical (telemetry, physicsPrediction, residuals) triple into the single flat
     * feature-row shape /ml/analyze's {@code history: list[dict]} expects — matching exactly how
     * the Python endpoint itself flattens the *current* sample internally ({@code combined = {
     * **telemetry, **prediction, **residuals}}). A nested {telemetry:{...}, prediction:{...}}
     * shape here would silently fail the Python side's required-columns validation, since pandas
     * would see "telemetry"/"prediction" as single object-valued columns instead of the
     * individual rpm/egt/... columns the feature builder requires.
     *
     * <p>{@code runId} must be included on every row, not just the current sample: Python's
     * {@code build_live_features} only fills a missing "runId" column with a whole-frame default
     * when the column is absent from every row. Since the current sample's row always carries a
     * runId (from the top-level request), a history row missing it would otherwise leave that one
     * cell null rather than defaulted, and {@code validate_dataset} rejects any null in a
     * required column.
     */
    private Map<String, Object> toFlatFeatureRow(DiagnosticSnapshot snapshot) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.putAll(objectMapper.convertValue(snapshot.telemetry(), MAP_TYPE));
        row.putAll(objectMapper.convertValue(snapshot.physicsPrediction(), MAP_TYPE));
        row.putAll(objectMapper.convertValue(snapshot.residuals(), MAP_TYPE));
        row.put("runId", 0);
        return row;
    }

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private record MLAnalyzeRequest(
            Telemetry telemetry,
            PhysicsPrediction prediction,
            PhysicsResidual residuals,
            int runId,
            List<Map<String, Object>> history
    ) {
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
