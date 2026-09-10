package com.aerotwin.service;

import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.HealthResult;
import com.aerotwin.model.TwinSnapshot;
import com.aerotwin.service.DegradationServiceClient.DegradationServiceUnavailableException;
import com.aerotwin.service.HealthServiceClient.HealthServiceUnavailableException;
import com.aerotwin.service.MLServiceClient.MLServiceUnavailableException;
import com.aerotwin.service.PhysicsServiceClient.PhysicsServiceUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class DiagnosticService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DiagnosticService.class);
    private static final int MAX_HISTORY = 60;

    private final TwinService twinService;
    private final MLServiceClient mlServiceClient;
    private final HealthServiceClient healthServiceClient;
    private final DegradationServiceClient degradationServiceClient;
    private final Deque<DiagnosticSnapshot> history = new ArrayDeque<>();
    private final AtomicReference<DiagnosticSnapshot> latestDiagnostics = new AtomicReference<>();
    private final AtomicReference<RuntimeException> lastTickFailure = new AtomicReference<>();

    public DiagnosticService(TwinService twinService, MLServiceClient mlServiceClient,
                             HealthServiceClient healthServiceClient,
                             DegradationServiceClient degradationServiceClient) {
        this.twinService = twinService;
        this.mlServiceClient = mlServiceClient;
        this.healthServiceClient = healthServiceClient;
        this.degradationServiceClient = degradationServiceClient;
    }

    /**
     * Advances the diagnostic pipeline by exactly one sample, driven by the same 1Hz
     * scheduler that advances {@link SimulationService} (see {@code TelemetryWebSocketHandler}).
     *
     * <p>This is the ONLY place that appends to the ML diagnostic {@code history} — REST reads
     * via {@link #getCurrentDiagnostics()} must never mutate it. The model's rolling-window
     * features (a 5-sample window) were trained assuming exactly 1-second-spaced samples; before
     * this method existed, {@code history} was instead populated once per REST poll to
     * {@code /api/diagnostics/current} (and the health/degradation/RUL endpoints, which all
     * funnel through {@link #getCurrentDiagnostics()}), so "5 samples" silently meant "the last 5
     * times a client happened to poll" rather than "5 seconds." See
     * AEROTWIN_PROJECT_MASTER.md FINDING-5 (§15.7/§15.8) for the investigation and evidence
     * behind this fix.
     *
     * <p>Downstream-unavailable failures are caught here rather than allowed to propagate,
     * mirroring {@link SimulationService#tick()}'s established pattern — an uncaught exception
     * here would silently cancel all future scheduled ticks. The failure is stored and re-thrown
     * by the next {@link #getCurrentDiagnostics()} call instead, preserving the existing 503
     * propagation behavior exactly (same exception types, same partial-snapshot payloads).
     */
    public void tick() {
        try {
            TwinSnapshot twinSnapshot = twinService.getCurrentTwin();
            DiagnosticSnapshot base = new DiagnosticSnapshot(
                    twinSnapshot.telemetry(),
                    twinSnapshot.prediction(),
                    twinSnapshot.residuals(),
                    mlServiceClient.analyze(twinSnapshot, new ArrayList<>(history))
            );
            HealthResult health = healthServiceClient.evaluate(base, new ArrayList<>(history));
            DiagnosticSnapshot healthSnapshot = new DiagnosticSnapshot(base.telemetry(), base.physicsPrediction(),
                base.residuals(), base.analysis(), health);
            DegradationServiceClient.DegradationResponse degradation = degradationServiceClient.evaluate(
                healthSnapshot, new ArrayList<>(history));
            DiagnosticSnapshot complete = new DiagnosticSnapshot(
                base.telemetry(), base.physicsPrediction(), base.residuals(), base.analysis(), health,
                degradation.degradation(), degradation.rul());
            synchronized (history) {
                history.addLast(complete);
                while (history.size() > MAX_HISTORY) {
                    history.removeFirst();
                }
            }
            latestDiagnostics.set(complete);
            lastTickFailure.set(null);
        } catch (PhysicsServiceUnavailableException | MLServiceUnavailableException
                | HealthServiceUnavailableException | DegradationServiceUnavailableException exception) {
            LOGGER.warn("Diagnostic tick failed, a downstream service is unavailable: {}", exception.getMessage());
            lastTickFailure.set(exception);
        }
    }

    /**
     * Returns the most recently computed diagnostic snapshot. Read-only: never triggers a new
     * downstream computation or mutates history (that is {@link #tick()}'s job) — except to
     * bootstrap once if called before the scheduler has ever ticked, mirroring
     * {@link SimulationService#getLatestTelemetry()}'s identical bootstrap pattern. Any number of
     * REST clients, at any polling rate, reading this repeatedly between scheduler ticks always
     * get back the same cached snapshot and never change the history's length or cadence.
     *
     * @throws PhysicsServiceUnavailableException | MLServiceUnavailableException
     *         | HealthServiceUnavailableException | DegradationServiceUnavailableException
     *         if the most recent tick failed — re-thrown from the stored failure, not freshly
     *         thrown, so callers see exactly the same exception (and partial-snapshot payload)
     *         they would have before this change.
     */
    public DiagnosticSnapshot getCurrentDiagnostics() {
        if (latestDiagnostics.get() == null && lastTickFailure.get() == null) {
            tick();
        }
        RuntimeException failure = lastTickFailure.get();
        if (failure != null) {
            throw failure;
        }
        return latestDiagnostics.get();
    }

    /**
     * Clears the rolling diagnostic history. Called when the live simulator's fault state
     * changes (activation or reset to healthy) so health/degradation/RUL trend calculations
     * don't blend samples from before and after the transition into one misleading trend.
     */
    public void resetHistory() {
        synchronized (history) {
            history.clear();
        }
    }
}