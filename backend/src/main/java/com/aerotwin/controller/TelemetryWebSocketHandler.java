package com.aerotwin.controller;

import com.aerotwin.service.DiagnosticService;
import com.aerotwin.service.SimulationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class TelemetryWebSocketHandler extends TextWebSocketHandler {

    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final SimulationService simulationService;
    private final DiagnosticService diagnosticService;
    private final ObjectMapper objectMapper;
    private final ScheduledExecutorService executorService = Executors.newSingleThreadScheduledExecutor();

    /**
     * Uses the Spring-managed {@link ObjectMapper} bean (constructor-injected) instead of
     * constructing a new one, so WebSocket frames serialize {@code timestamp} as ISO-8601 —
     * consistent with every REST endpoint — rather than as a raw epoch-seconds float.
     * Previously this class built its own {@code ObjectMapper}, which does not have Spring
     * Boot's autoconfigured {@code WRITE_DATES_AS_TIMESTAMPS=false} setting, and serialized
     * {@code Instant} fields as numbers (BUG-3, see AEROTWIN_PROJECT_MASTER.md §8). Confirmed
     * safe to fix: the frontend does not read {@code telemetry.timestamp} anywhere.
     */
    public TelemetryWebSocketHandler(
            SimulationService simulationService, DiagnosticService diagnosticService, ObjectMapper objectMapper) {
        this.simulationService = simulationService;
        this.diagnosticService = diagnosticService;
        this.objectMapper = objectMapper;

        // Start streaming data to connected clients at 1Hz
        this.executorService.scheduleAtFixedRate(this::broadcastTelemetry, 1, 1, TimeUnit.SECONDS);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    /**
     * The single 1Hz clock that drives both the live simulation and the diagnostic ML
     * history. {@code diagnosticService.tick()} runs here — not from any REST controller —
     * so the diagnostic history's sample cadence is exactly 1 sample/second regardless of
     * how many REST clients poll {@code /api/diagnostics/current} or how often (see
     * AEROTWIN_PROJECT_MASTER.md FINDING-5, §15.8). {@code DiagnosticService.tick()} catches
     * its own downstream-unavailable failures internally (mirroring
     * {@code SimulationService.tick()}'s established pattern), so it is safe to call
     * unconditionally here without risking this scheduled job dying on a transient outage.
     */
    private void broadcastTelemetry() {
        simulationService.tick();
        diagnosticService.tick();

        if (sessions.isEmpty()) {
            return;
        }

        try {
            String payload = objectMapper.writeValueAsString(simulationService.getLatestTelemetry());
            TextMessage message = new TextMessage(payload);
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    session.sendMessage(message);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
