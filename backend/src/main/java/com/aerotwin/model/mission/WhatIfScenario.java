package com.aerotwin.model.mission;

import java.util.List;

public record WhatIfScenario(
        double cruiseDurationMultiplier,
        double loadDelta,
        double throttleDelta,
        List<String> selectedPhases,
        String faultTypeOverride
) {
    /** Default scenario: baseline (no changes). */
    public WhatIfScenario() {
        this(1.0, 0.0, 0.0, List.of("CRUISE", "LOITER"), null);
    }
}
