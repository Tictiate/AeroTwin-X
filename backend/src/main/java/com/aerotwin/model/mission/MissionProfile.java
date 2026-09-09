package com.aerotwin.model.mission;

import java.util.List;

public record MissionProfile(
        String missionId,
        List<MissionPhaseSpec> phases
) {}
