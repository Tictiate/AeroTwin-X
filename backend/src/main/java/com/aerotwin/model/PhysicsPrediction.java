package com.aerotwin.model;

public record PhysicsPrediction(
        double expectedRpm,
        double expectedEgt,
        double expectedCht,
        double expectedOilTemperature,
        double expectedOilPressure,
        double expectedFuelFlow,
        double expectedVibration,
        double expectedBatteryVoltage
) {}