package com.aerotwin.controller;

import com.aerotwin.service.SimulationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
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
    private final ObjectMapper objectMapper;
    private final ScheduledExecutorService executorService = Executors.newSingleThreadScheduledExecutor();

    public TelemetryWebSocketHandler(SimulationService simulationService) {
        this.simulationService = simulationService;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        
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

    private void broadcastTelemetry() {
        if (sessions.isEmpty()) {
            // Tick the simulation anyway to keep the state moving forward
            simulationService.tick();
            return;
        }

        // Tick simulation and broadcast
        simulationService.tick();
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
