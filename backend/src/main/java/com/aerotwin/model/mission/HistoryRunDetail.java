package com.aerotwin.model.mission;

import java.util.List;

public record HistoryRunDetail(
        String scenario,
        String missionId,
        String engineId,
        int totalSamples,
        List<HistoryPoint> points
) {}
