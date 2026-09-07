package com.aerotwin.model;

public record SensorHealthResult(
        double health,
        String status,
        double confidence,
        String reason
) {}