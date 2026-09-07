package com.aerotwin.model;

import java.util.Map;

public record MLAnalysis(
        boolean anomaly,
        double anomalyScore,
        String predictedFault,
        Map<String, Double> faultProbabilities,
        String modelVersion
) {}