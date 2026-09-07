package com.aerotwin.model;

import java.time.Instant;

public record PhysicsResidual(
        Instant timestamp,
        String engineId,
        String missionId,
        double rpmResidual,
        double egtResidual,
        double chtResidual,
        double oilTemperatureResidual,
        double oilPressureResidual,
        double fuelFlowResidual,
        double vibrationResidual,
        double normalizedRpmResidual,
        double normalizedEgtResidual,
        double normalizedChtResidual,
        double normalizedOilTemperatureResidual,
        double normalizedOilPressureResidual,
        double normalizedFuelFlowResidual,
        double normalizedVibrationResidual
) {}