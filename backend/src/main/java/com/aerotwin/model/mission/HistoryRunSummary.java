package com.aerotwin.model.mission;

public record HistoryRunSummary(
        String scenario,
        String missionId,
        String engineId,
        int totalSamples
) {}
