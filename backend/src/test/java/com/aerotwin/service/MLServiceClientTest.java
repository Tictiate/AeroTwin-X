package com.aerotwin.service;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.RequestMatcher;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MLServiceClientTest {

    private static final String SUCCESS_BODY = """
            {
              "anomaly": true,
              "anomalyScore": 0.82,
              "predictedFault": "INJECTOR_DEGRADATION",
              "faultProbabilities": {"INJECTOR_DEGRADATION": 0.87},
              "modelVersion": "phase4-v1",
              "explanation": {
                "predictedFault": "INJECTOR_DEGRADATION",
                "classifierConfidence": 0.87,
                "explanationAvailable": true,
                "topContributors": [
                  {
                    "feature": "fuelFlowResidual",
                    "value": 2.5,
                    "shapValue": 1.25,
                    "direction": "TOWARD_FAULT",
                    "description": "Fuel flow difference from physics expectation"
                  }
                ],
                "operatorSummary": "Likely injector degradation."
              }
            }
            """;

    @Test
    void postsTwinSnapshotAndReadsAnalysis() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MLServiceClient client = new MLServiceClient(builder, mapper(), "http://ml.test");

        server.expect(requestTo("http://ml.test/ml/analyze"))
                .andExpect(method(POST))
                .andRespond(withSuccess(SUCCESS_BODY, MediaType.APPLICATION_JSON));

        MLAnalysis analysis = client.analyze(snapshot(), List.of());

        assertEquals("INJECTOR_DEGRADATION", analysis.predictedFault());
        assertEquals(0.82, analysis.anomalyScore());
        assertEquals(true, analysis.explanation().explanationAvailable());
        assertEquals(1, analysis.explanation().topContributors().size());
        assertEquals("fuelFlowResidual", analysis.explanation().topContributors().get(0).feature());
        assertEquals("TOWARD_FAULT", analysis.explanation().topContributors().get(0).direction());
        server.verify();
    }

    @Test
    void emptyHistorySerializesAsAnEmptyArray() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MLServiceClient client = new MLServiceClient(builder, mapper(), "http://ml.test");
        ObjectMapper verifier = mapper();

        server.expect(requestTo("http://ml.test/ml/analyze"))
                .andExpect(historyMatches(verifier, node -> assertTrue(node.isArray() && node.isEmpty())))
                .andRespond(withSuccess(SUCCESS_BODY, MediaType.APPLICATION_JSON));

        client.analyze(snapshot(), List.of());
        server.verify();
    }

    @Test
    void historySamplesAreSentAsFlatFeatureRowsNotNestedObjects() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MLServiceClient client = new MLServiceClient(builder, mapper(), "http://ml.test");
        ObjectMapper verifier = mapper();

        DiagnosticSnapshot priorSample = new DiagnosticSnapshot(
                telemetry(), prediction(), residual(),
                new MLAnalysis(false, 0.1, "NORMAL", java.util.Map.of("NORMAL", 1.0), "phase4-v1"));

        server.expect(requestTo("http://ml.test/ml/analyze"))
                .andExpect(historyMatches(verifier, node -> {
                    assertTrue(node.isArray());
                    assertEquals(1, node.size());
                    JsonNode row = node.get(0);
                    // Flat: rpm/egt/expectedRpm/rpmResidual all live directly on the row,
                    // not nested under "telemetry"/"prediction"/"residuals" keys.
                    assertTrue(row.has("rpm"));
                    assertTrue(row.has("expectedRpm"));
                    assertTrue(row.has("rpmResidual"));
                    // Regression: a history row missing "runId" leaves that column null for this
                    // row only (the current sample always carries one), which fails Python's
                    // required-columns validation with a 500 — caught live before this assertion
                    // was added.
                    assertTrue(row.has("runId"));
                    assertFalse(row.has("telemetry"));
                    assertFalse(row.has("prediction"));
                    assertFalse(row.has("residuals"));
                    assertEquals(3500.0, row.get("rpm").asDouble());
                }))
                .andRespond(withSuccess(SUCCESS_BODY, MediaType.APPLICATION_JSON));

        client.analyze(snapshot(), List.of(priorSample));
        server.verify();
    }

    private RequestMatcher historyMatches(ObjectMapper mapper, java.util.function.Consumer<JsonNode> assertion) {
        return request -> {
            try {
                String bodyText = ((MockClientHttpRequest) request).getBodyAsString();
                JsonNode body = mapper.readTree(bodyText);
                assertion.accept(body.get("history"));
            } catch (Exception e) {
                throw new AssertionError("Failed to parse request body", e);
            }
        };
    }

    private TwinSnapshot snapshot() {
        return new TwinSnapshot(telemetry(), prediction(), residual());
    }

    private Telemetry telemetry() {
        return new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }

    private PhysicsPrediction prediction() {
        return new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
    }

    private PhysicsResidual residual() {
        return new PhysicsResidual(telemetry().timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    }

    /** Mirrors Spring Boot's autoconfigured ObjectMapper, which registers JavaTimeModule for Instant. */
    private ObjectMapper mapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        return mapper;
    }
}
