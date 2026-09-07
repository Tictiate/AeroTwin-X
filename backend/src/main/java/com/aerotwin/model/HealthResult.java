package com.aerotwin.model;

import java.util.List;
import java.util.Map;

public record HealthResult(
        double overallHealth,
        String status,
        Map<String, Double> subsystems,
        HealthTrend trend,
        Map<String, SensorHealthResult> sensorHealth,
        List<HealthContributor> contributors,
        String diagnosticType,
        String affectedSensor,
        String faultType,
        double diagnosticConfidence
) {}