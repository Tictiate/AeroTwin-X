package com.aerotwin.service;

import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MLServiceClientTest {

    @Test
    void postsTwinSnapshotAndReadsAnalysis() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MLServiceClient client = new MLServiceClient(builder, "http://ml.test");

        server.expect(requestTo("http://ml.test/ml/analyze"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {
                          "anomaly": true,
                          "anomalyScore": 0.82,
                          "predictedFault": "INJECTOR_DEGRADATION",
                          "faultProbabilities": {"INJECTOR_DEGRADATION": 0.87},
                          "modelVersion": "phase4-v1"
                        }
                        """, MediaType.APPLICATION_JSON));

        var analysis = client.analyze(snapshot());

        assertEquals("INJECTOR_DEGRADATION", analysis.predictedFault());
        assertEquals(0.82, analysis.anomalyScore());
        server.verify();
    }

    private TwinSnapshot snapshot() {
        Telemetry telemetry = new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
        PhysicsPrediction prediction = new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
        PhysicsResidual residual = new PhysicsResidual(telemetry.timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        return new TwinSnapshot(telemetry, prediction, residual);
    }
}