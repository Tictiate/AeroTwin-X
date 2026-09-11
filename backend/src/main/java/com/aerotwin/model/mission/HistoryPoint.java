package com.aerotwin.model.mission;

public record HistoryPoint(
        String timestamp,
        Double health,
        Double degradation,
        Double degradationRatePerHour,
        String dominantMechanism,
        Double rulHours,
        Double rulLowerBoundHours,
        Double rulUpperBoundHours,
        Double rulConfidence,
        String rulStatus,
        String diagnosticType,
        String affectedSensor
) {}
