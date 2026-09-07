package com.aerotwin.model;

public record HealthTrend(
        String direction,
        double ratePerHour
) {}