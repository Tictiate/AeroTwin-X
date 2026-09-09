package com.aerotwin.model.mission;

public record MissionPhaseResult(
        String phase,
        double durationSeconds,
        double startHealth,
        double endHealth,
        double minimumHealth,
        double degradationIncrease,
        double phaseRiskScore,
        String riskBand
) {}
