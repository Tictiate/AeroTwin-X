package com.aerotwin.service;

import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ResidualServiceTest {

    private static final Instant TIMESTAMP = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void calculatesSignedRawAndNormalizedResiduals() {
        Telemetry actual = telemetry(110.0, 90.0);
        PhysicsPrediction expected = prediction(100.0, 100.0);

        PhysicsResidual residual = new ResidualService().calculate(actual, expected);

        assertEquals(10.0, residual.rpmResidual());
        assertEquals(-10.0, residual.egtResidual());
        assertEquals(0.1, residual.normalizedRpmResidual());
        assertEquals(-0.1, residual.normalizedEgtResidual());
    }

    @Test
    void equalActualAndExpectedValuesProduceZeroResiduals() {
        Telemetry actual = telemetry(100.0, 100.0);
        PhysicsResidual residual = new ResidualService().calculate(actual, prediction(100.0, 100.0));

        assertEquals(0.0, residual.rpmResidual());
        assertEquals(0.0, residual.egtResidual());
        assertEquals(0.0, residual.normalizedRpmResidual());
        assertEquals(0.0, residual.normalizedEgtResidual());
    }

    private Telemetry telemetry(double rpm, double egt) {
        return new Telemetry(TIMESTAMP, "ENG-1", "MSN-1", MissionPhase.CRUISE,
                3000.0, 10.0, 0.6, 0.4, rpm, egt, 120.0,
                80.0, 300.0, 10.0, 4.0, 14.2);
    }

    private PhysicsPrediction prediction(double rpm, double egt) {
        return new PhysicsPrediction(rpm, egt, 120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
    }
}