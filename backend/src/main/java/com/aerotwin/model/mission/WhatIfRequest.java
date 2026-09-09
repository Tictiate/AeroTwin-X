package com.aerotwin.model.mission;

import com.aerotwin.model.DegradationState;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record WhatIfRequest(
        MissionProfile baseMission,
        WhatIfScenario scenario,
        DegradationState currentDegradation,
        Double initialRulHours,
        String faultType
) {
    /** Convenience constructor for default scenario on a given base mission. */
    public WhatIfRequest(MissionProfile baseMission, WhatIfScenario scenario) {
        this(baseMission, scenario, null, null, null);
    }
}
