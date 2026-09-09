package com.aerotwin.model;

public record FeatureContributor(
        String feature,
        double value,
        double shapValue,
        String direction,
        String description
) {}
