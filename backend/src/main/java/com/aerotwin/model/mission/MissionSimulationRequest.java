package com.aerotwin.model.mission;

import com.aerotwin.model.DegradationState;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MissionSimulationRequest(
        MissionProfile profile,
        DegradationState currentDegradation,
        Double initialRulHours,
        String faultType,
        double stepSeconds
) {
    /** Compact constructor: supply defaults matching Python API defaults. */
    public MissionSimulationRequest {
        if (stepSeconds <= 0.0) stepSeconds = 30.0;
    }

    /** Convenience constructor without optional fields. */
    public MissionSimulationRequest(MissionProfile profile) {
        this(profile, null, null, null, 30.0);
    }
}
