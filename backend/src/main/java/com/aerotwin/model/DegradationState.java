package com.aerotwin.model;

import java.util.Map;

public record DegradationState(
        String timestamp,
        String engineId,
        double overallHealth,
        double overallDegradation,
        Map<String, Double> componentDegradation,
        double sensorQualityDegradation,
        double degradationRatePerHour,
        String dominantMechanism,
        String trend,
        double confidence,
        String dataQuality,
        int historySamples
) {}