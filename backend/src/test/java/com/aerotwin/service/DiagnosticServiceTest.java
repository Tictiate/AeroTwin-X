package com.aerotwin.service;

import com.aerotwin.model.DegradationState;
import com.aerotwin.model.DiagnosticSnapshot;
import com.aerotwin.model.HealthResult;
import com.aerotwin.model.HealthTrend;
import com.aerotwin.model.MLAnalysis;
import com.aerotwin.model.MissionPhase;
import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.PhysicsResidual;
import com.aerotwin.model.RulEstimate;
import com.aerotwin.model.Telemetry;
import com.aerotwin.model.TwinSnapshot;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code tick()} is the only method that advances the diagnostic pipeline and appends to
 * history — it is driven by the 1Hz simulation scheduler, not REST reads. {@code
 * getCurrentDiagnostics()} is read-only: it returns whatever {@code tick()} last computed
 * (bootstrapping once if called before any tick has ever run) and never mutates history or
 * triggers a new downstream computation. See AEROTWIN_PROJECT_MASTER.md FINDING-5 (§15.7/§15.8)
 * for why this separation exists — REST-poll-driven history population silently broke the ML
 * model's fixed 1-second-per-sample rolling-window assumption.
 */
class DiagnosticServiceTest {

    @Test
    void firstTickSendsEmptyHistoryToEveryDownstreamService() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList())).thenReturn(analysis());
        when(healthServiceClient.evaluate(any(), anyList())).thenReturn(health());
        when(degradationServiceClient.evaluate(any(), anyList()))
                .thenReturn(new DegradationServiceClient.DegradationResponse(degradation(), rul()));

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);
        service.tick();

        verify(mlServiceClient).analyze(any(), eq(List.of()));
    }

    @Test
    void mlHistoryNeverIncludesTheCurrentTickBeingAnalyzed() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList())).thenReturn(analysis());
        when(healthServiceClient.evaluate(any(), anyList())).thenReturn(health());
        when(degradationServiceClient.evaluate(any(), anyList()))
                .thenReturn(new DegradationServiceClient.DegradationResponse(degradation(), rul()));

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);

        // Three ticks in a row: each tick's own sample must not appear in the history it is sent.
        service.tick();
        service.tick();
        service.tick();

        ArgumentCaptor<List<DiagnosticSnapshot>> historyCaptor = historyCaptor();
        verify(mlServiceClient, times(3)).analyze(any(), historyCaptor.capture());

        List<List<DiagnosticSnapshot>> capturedHistories = historyCaptor.getAllValues();
        assertEquals(0, capturedHistories.get(0).size(), "first tick has no prior history");
        assertEquals(1, capturedHistories.get(1).size(), "second tick sees exactly the first tick's sample");
        assertEquals(2, capturedHistories.get(2).size(), "third tick sees exactly the first two ticks' samples");
    }

    @Test
    void resetHistoryClearsWhatFutureTicksSendAsHistory() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList())).thenReturn(analysis());
        when(healthServiceClient.evaluate(any(), anyList())).thenReturn(health());
        when(degradationServiceClient.evaluate(any(), anyList()))
                .thenReturn(new DegradationServiceClient.DegradationResponse(degradation(), rul()));

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);

        service.tick();
        service.tick();
        service.resetHistory();
        service.tick();

        ArgumentCaptor<List<DiagnosticSnapshot>> historyCaptor = historyCaptor();
        verify(mlServiceClient, times(3)).analyze(any(), historyCaptor.capture());
        assertTrue(historyCaptor.getAllValues().get(2).isEmpty(), "history must be empty right after reset");
    }

    @Test
    void readingCurrentDiagnosticsRepeatedlyNeverMutatesHistoryOrRecomputes() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList())).thenReturn(analysis());
        when(healthServiceClient.evaluate(any(), anyList())).thenReturn(health());
        when(degradationServiceClient.evaluate(any(), anyList()))
                .thenReturn(new DegradationServiceClient.DegradationResponse(degradation(), rul()));

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);

        // Simulate the scheduler having already ticked once.
        service.tick();

        // A REST client (or several, at any polling rate) reading repeatedly between ticks.
        DiagnosticSnapshot first = service.getCurrentDiagnostics();
        for (int i = 0; i < 9; i++) {
            DiagnosticSnapshot repeated = service.getCurrentDiagnostics();
            assertSame(first, repeated, "repeated reads between ticks must return the identical cached snapshot");
        }

        // Only the one explicit tick() call should have triggered any downstream computation.
        verify(mlServiceClient, times(1)).analyze(any(), anyList());
        verify(healthServiceClient, times(1)).evaluate(any(), anyList());
        verify(degradationServiceClient, times(1)).evaluate(any(), anyList());

        // A subsequent tick must still see zero prior history — the 10 reads above appended nothing.
        service.tick();
        ArgumentCaptor<List<DiagnosticSnapshot>> historyCaptor = historyCaptor();
        verify(mlServiceClient, times(2)).analyze(any(), historyCaptor.capture());
        assertEquals(1, historyCaptor.getAllValues().get(1).size(),
                "second tick must see exactly the first tick's one sample, not one per REST read");
    }

    @Test
    void getCurrentDiagnosticsBootstrapsExactlyOnceWhenCalledBeforeAnyTick() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList())).thenReturn(analysis());
        when(healthServiceClient.evaluate(any(), anyList())).thenReturn(health());
        when(degradationServiceClient.evaluate(any(), anyList()))
                .thenReturn(new DegradationServiceClient.DegradationResponse(degradation(), rul()));

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);

        // No tick() called yet — mirrors SimulationService.getLatestTelemetry()'s bootstrap.
        DiagnosticSnapshot first = service.getCurrentDiagnostics();
        DiagnosticSnapshot second = service.getCurrentDiagnostics();

        assertSame(first, second);
        verify(mlServiceClient, times(1)).analyze(any(), anyList());
    }

    @Test
    void tickFailureDoesNotAppendHistoryAndIsRethrownByTheNextRead() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        MLServiceClient.MLServiceUnavailableException failure =
                new MLServiceClient.MLServiceUnavailableException("ML service is unavailable", twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList())).thenThrow(failure);

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);

        // tick() must not throw — an uncaught exception here would kill the 1Hz scheduler.
        service.tick();

        // The same failure must surface to a reader, exactly as it would have before this
        // refactor (existing controllers catch this exact exception type for 503 propagation).
        MLServiceClient.MLServiceUnavailableException thrown = assertThrows(
                MLServiceClient.MLServiceUnavailableException.class, service::getCurrentDiagnostics);
        assertSame(failure, thrown);

        // health/degradation must never have been reached for a tick that already failed upstream.
        verify(healthServiceClient, never()).evaluate(any(), anyList());
        verify(degradationServiceClient, never()).evaluate(any(), anyList());
    }

    @Test
    void serviceRecoversOnTheNextSuccessfulTickAfterAFailure() {
        TwinService twinService = mock(TwinService.class);
        MLServiceClient mlServiceClient = mock(MLServiceClient.class);
        HealthServiceClient healthServiceClient = mock(HealthServiceClient.class);
        DegradationServiceClient degradationServiceClient = mock(DegradationServiceClient.class);

        when(twinService.getCurrentTwin()).thenReturn(twinSnapshot());
        when(mlServiceClient.analyze(any(), anyList()))
                .thenThrow(new MLServiceClient.MLServiceUnavailableException("down", twinSnapshot()))
                .thenReturn(analysis());
        when(healthServiceClient.evaluate(any(), anyList())).thenReturn(health());
        when(degradationServiceClient.evaluate(any(), anyList()))
                .thenReturn(new DegradationServiceClient.DegradationResponse(degradation(), rul()));

        DiagnosticService service = new DiagnosticService(
                twinService, mlServiceClient, healthServiceClient, degradationServiceClient);

        service.tick(); // fails
        assertThrows(MLServiceClient.MLServiceUnavailableException.class, service::getCurrentDiagnostics);

        service.tick(); // succeeds
        DiagnosticSnapshot snapshot = service.getCurrentDiagnostics();
        assertEquals(analysis(), snapshot.analysis(), "recovery must not require manual intervention");
    }

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<List<DiagnosticSnapshot>> historyCaptor() {
        return (ArgumentCaptor<List<DiagnosticSnapshot>>) (ArgumentCaptor<?>) ArgumentCaptor.forClass(List.class);
    }

    private TwinSnapshot twinSnapshot() {
        Telemetry telemetry = new Telemetry(Instant.parse("2026-01-01T00:00:00Z"), "ENG-1", "MSN-1",
                MissionPhase.CRUISE, 3000.0, 10.0, 0.6, 0.4, 3500.0, 500.0,
                120.0, 80.0, 300.0, 10.0, 4.0, 14.2);
        PhysicsPrediction prediction = new PhysicsPrediction(3500.0, 500.0, 120.0, 80.0,
                300.0, 10.0, 4.0, 14.2);
        PhysicsResidual residual = new PhysicsResidual(telemetry.timestamp(), "ENG-1", "MSN-1",
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        return new TwinSnapshot(telemetry, prediction, residual);
    }

    private MLAnalysis analysis() {
        return new MLAnalysis(false, 0.1, "NORMAL", Map.of("NORMAL", 1.0), "phase4-v1");
    }

    private HealthResult health() {
        return new HealthResult(95.0, "HEALTHY", Map.of("thermal", 95.0),
                new HealthTrend("STABLE", 0.0), Map.of(), List.of(), "NORMAL", null, null, 0.5);
    }

    private DegradationState degradation() {
        return new DegradationState("2026-01-01T00:00:00Z", "ENG-1", 95.0, 0.05,
                Map.of("thermal", 0.05), 0.0, 0.0, "NONE", "INSUFFICIENT_HISTORY", 0.1, "LOW", 1);
    }

    private RulEstimate rul() {
        return new RulEstimate(null, null, null, 0.1, "INSUFFICIENT_HISTORY", 50.0, 0.0,
                "RUL requires more sequential health history before extrapolation.");
    }
}
