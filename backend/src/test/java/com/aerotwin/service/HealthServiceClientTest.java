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

class HealthServiceClientTest {

    @Test
    void postsDiagnosticHistoryAndReadsHealthResult() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HealthServiceClient client = new HealthServiceClient(builder, "http://health.test");
        server.expect(requestTo("http://health.test/health/evaluate"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {
                          "overallHealth": 88.0,
                          "status": "CAUTION",
                          "subsystems": {"thermal": 90.0},
                          "trend": {"direction": "STABLE", "ratePerHour": 0.0},
                          "sensorHealth": {},
                          "contributors": [],
                          "diagnosticType": "NORMAL",
                          "affectedSensor": null,
                          "faultType": null,
                          "diagnosticConfidence": 0.9
                        }
                        """, MediaType.APPLICATION_JSON));

        var result = client.evaluate(snapshot(), List.of());

        assertEquals(88.0, result.overallHealth());
        assertEquals("CAUTION", result.status());
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