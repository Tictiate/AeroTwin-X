package com.aerotwin.service;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class DegradationServiceClientTest {

    @Test
    void postsHistoryAndReadsDegradationAndRul() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        DegradationServiceClient client = new DegradationServiceClient(builder, "http://degradation.test");
        server.expect(requestTo("http://degradation.test/degradation/evaluate"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {
                          "degradation": {
                            "timestamp": "2026-01-01T00:00:00Z",
                            "engineId": "ENG-1",
                            "overallHealth": 80.0,
                            "overallDegradation": 0.2,
                            "componentDegradation": {"combustion": 0.3},
                            "sensorQualityDegradation": 0.0,
                            "degradationRatePerHour": 2.0,
                            "dominantMechanism": "INJECTOR_DEGRADATION",
                            "trend": "DEGRADING",
                            "confidence": 0.8,
                            "dataQuality": "HIGH",
                            "historySamples": 10
                          },
                          "rul": {
                            "rulHours": 15.0,
                            "lowerBoundHours": 10.0,
                            "upperBoundHours": 20.0,
                            "confidence": 0.8,
                            "status": "ESTIMATED",
                            "eolHealthThreshold": 50.0,
                            "degradationRatePerHour": 2.0,
                            "explanation": "Prototype estimate"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        var result = client.evaluate(snapshot(), List.of());

        assertEquals(0.2, result.degradation().overallDegradation());
        assertEquals(15.0, result.rul().rulHours());
        server.verify();
    }

    private DiagnosticSnapshot snapshot() {
        Telemetry telemetry = new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
        PhysicsPrediction prediction = new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
        PhysicsResidual residual = new PhysicsResidual(telemetry.timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        return new DiagnosticSnapshot(telemetry, prediction, residual,
                new MLAnalysis(false, 0.05, "NORMAL", Map.of("NORMAL", 1.0), "phase4-v1"));
    }
}