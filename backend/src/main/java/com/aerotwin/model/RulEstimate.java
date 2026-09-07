package com.aerotwin.model;

public record RulEstimate(
        Double rulHours,
        Double lowerBoundHours,
        Double upperBoundHours,
        double confidence,
        String status,
        double eolHealthThreshold,
        double degradationRatePerHour,
        String explanation
) {}