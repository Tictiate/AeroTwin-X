package com.aerotwin.model.mission;

import java.util.List;
import java.util.Map;

public record MissionSimulationResult(
        String missionId,
        double totalDurationSeconds,
        double missionRiskScore,
        double missionReliabilityScore,
        String riskBand,
        String operatorRecommendation,
        String operatorRationale,
        double projectedEndHealth,
        double minimumProjectedHealth,
        String criticalPhase,
        Double estimatedFailureTimeSeconds,
        List<MissionPhaseResult> phaseResults,
        Map<String, Double> finalComponentDegradation,
        double sensorObservabilityRisk
) {}
