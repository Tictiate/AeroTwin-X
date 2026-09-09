package com.aerotwin.model;

import java.util.List;

public record DiagnosticExplanation(
        String predictedFault,
        double classifierConfidence,
        boolean explanationAvailable,
        List<FeatureContributor> topContributors,
        String operatorSummary
) {
    public DiagnosticExplanation {
        topContributors = topContributors == null ? List.of() : List.copyOf(topContributors);
        operatorSummary = operatorSummary == null ? "" : operatorSummary;
    }
}
