package com.aerotwin.model.mission;

public record WhatIfResult(
        MissionSimulationResult baseline,
        MissionSimulationResult scenario,
        WhatIfDelta delta,
        String interpretation
) {}
