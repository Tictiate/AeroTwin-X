package com.aerotwin.service;

import com.aerotwin.model.FaultType;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.Telemetry;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class FaultInjectionServiceClientTest {

    @Test
    void postsHealthyTelemetryAndReturnsFaultedTelemetry() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FaultInjectionServiceClient client = new FaultInjectionServiceClient(builder, "http://physics.test");

        server.expect(requestTo("http://physics.test/simulation/inject-fault"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {
                          "telemetry": {
                            "timestamp": "2026-01-01T00:00:00Z",
                            "engineId": "ENG-1",
                            "missionId": "MSN-1",
                            "missionPhase": "CRUISE",
                            "altitude": 3000.0,
                            "ambientTemperature": 10.0,
                            "throttle": 0.6,
                            "load": 0.4,
                            "rpm": 3420.0,
                            "egt": 590.0,
                            "cht": 144.0,
                            "oilTemperature": 80.0,
                            "oilPressure": 300.0,
                            "fuelFlow": 12.5,
                            "vibration": 4.0,
                            "batteryVoltage": 14.2
                          },
                          "faultType": "INJECTOR_DEGRADATION",
                          "severity": 1.0,
                          "active": true
                        }
                        """, MediaType.APPLICATION_JSON));

        Telemetry result = client.injectFault(telemetry(), FaultType.INJECTOR_DEGRADATION, 240.0, null);

        assertEquals(590.0, result.egt());
        assertEquals(3420.0, result.rpm());
        server.verify();
    }

    @Test
    void unavailableServiceThrowsInjectionUnavailableException() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FaultInjectionServiceClient client = new FaultInjectionServiceClient(builder, "http://physics.test");

        server.expect(requestTo("http://physics.test/simulation/inject-fault"))
                .andRespond(withServerError());

        assertThrows(
                FaultInjectionServiceClient.FaultInjectionServiceUnavailableException.class,
                () -> client.injectFault(telemetry(), FaultType.MISFIRE, 250.0, null));
    }

    private Telemetry telemetry() {
        return new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }
}
