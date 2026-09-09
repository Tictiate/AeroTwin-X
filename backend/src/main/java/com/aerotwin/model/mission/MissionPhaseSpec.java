package com.aerotwin.model.mission;

public record MissionPhaseSpec(
        String phase,
        double durationSeconds,
        double altitudeStart,
        double altitudeEnd,
        double throttle,
        double load,
        double ambientTemperature
) {}
