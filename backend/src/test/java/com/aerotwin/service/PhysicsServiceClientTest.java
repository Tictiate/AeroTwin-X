package com.aerotwin.service;

import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.Telemetry;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.POST;

class PhysicsServiceClientTest {

    @Test
    void postsTelemetryAndReadsPhysicsPrediction() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PhysicsServiceClient client = new PhysicsServiceClient(builder, "http://physics.test");

        server.expect(requestTo("http://physics.test/physics/predict"))
                .andExpect(method(POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"engineId\":\"ENG-1\"")))
                .andRespond(withSuccess("""
                        {
                          "expectedRpm": 3900.0,
                          "expectedEgt": 600.0,
                          "expectedCht": 150.0,
                          "expectedOilTemperature": 82.0,
                          "expectedOilPressure": 395.0,
                          "expectedFuelFlow": 12.0,
                          "expectedVibration": 6.0,
                          "expectedBatteryVoltage": 14.2
                        }
                        """, MediaType.APPLICATION_JSON));

        PhysicsPrediction prediction = client.predict(telemetry());

        assertEquals(3900.0, prediction.expectedRpm());
        assertEquals(12.0, prediction.expectedFuelFlow());
        server.verify();
    }

    private Telemetry telemetry() {
        return new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }
}