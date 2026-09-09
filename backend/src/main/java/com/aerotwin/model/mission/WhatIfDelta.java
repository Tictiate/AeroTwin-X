package com.aerotwin.model.mission;

public record WhatIfDelta(
        double risk,
        double reliability,
        double endHealth,
        double minimumHealth
) {}
