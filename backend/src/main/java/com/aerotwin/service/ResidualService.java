package com.aerotwin.service;

import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.Telemetry;
import org.springframework.stereotype.Service;

@Service
public class ResidualService {

    public PhysicsResidual calculate(Telemetry actual, PhysicsPrediction expected) {
        double rpm = actual.rpm() - expected.expectedRpm();
        double egt = actual.egt() - expected.expectedEgt();
        double cht = actual.cht() - expected.expectedCht();
        double oilTemperature = actual.oilTemperature() - expected.expectedOilTemperature();
        double oilPressure = actual.oilPressure() - expected.expectedOilPressure();
        double fuelFlow = actual.fuelFlow() - expected.expectedFuelFlow();
        double vibration = actual.vibration() - expected.expectedVibration();

        return new PhysicsResidual(
                actual.timestamp(), actual.engineId(), actual.missionId(),
                rpm, egt, cht, oilTemperature, oilPressure, fuelFlow, vibration,
                normalized(rpm, expected.expectedRpm()),
                normalized(egt, expected.expectedEgt()),
                normalized(cht, expected.expectedCht()),
                normalized(oilTemperature, expected.expectedOilTemperature()),
                normalized(oilPressure, expected.expectedOilPressure()),
                normalized(fuelFlow, expected.expectedFuelFlow()),
                normalized(vibration, expected.expectedVibration())
        );
    }

    private double normalized(double residual, double expected) {
        return Math.abs(expected) < 1.0e-9 ? 0.0 : residual / expected;
    }
}