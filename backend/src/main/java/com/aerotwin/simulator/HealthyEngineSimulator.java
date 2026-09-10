package com.aerotwin.simulator;

import com.aerotwin.model.PhysicsPrediction;
import com.aerotwin.model.Telemetry;
import com.aerotwin.service.PhysicsServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Generates the live "healthy" telemetry baseline by delegating to the physics service's
 * {@code /physics/predict} — the same canonical model the offline dataset generator uses to
 * define "healthy" (see {@code app/simulation/mission_generator.py}'s {@code
 * next_healthy_telemetry}, which builds its healthy sample by calling {@code
 * predict_healthy_state} and copying its output field-for-field).
 *
 * <p>This class previously computed its own independent reduced-order formulas. That
 * implementation structurally diverged from the Python physics model (different RPM/EGT
 * equations, missing mission-phase and throttle/load correction terms — see
 * AEROTWIN_PROJECT_MASTER.md §15.5, FINDING-4), which meant live telemetry occupied a
 * different residual distribution than the one the ML models were trained on, even when
 * perfectly healthy. Delegating to the same canonical physics model the offline generator
 * uses removes that divergence by construction: Python remains the single source of truth
 * for healthy engine physics; Java owns only simulation orchestration, state, and timing.
 *
 * <p>{@code expectedCht}/{@code expectedOilTemperature} are themselves one-step first-order
 * filters anchored to the "previous" telemetry passed into {@code /physics/predict}
 * (see {@code physics-service/app/physics/thermal.py}). To keep that filter continuous
 * tick-to-tick — mirroring how the offline generator threads {@code previous.model_copy(...)}
 * forward — this simulator threads its own previous CHT/oil-temperature forward as instance
 * state, exactly as it did before, just now sourced from Python's response instead of a
 * locally-computed target.
 */
@Component
public class HealthyEngineSimulator implements EngineSimulator {

    private static final Logger LOGGER = LoggerFactory.getLogger(HealthyEngineSimulator.class);

    private final PhysicsServiceClient physicsServiceClient;

    private double previousCht;
    private double previousOilTemperature;
    private boolean seeded = false;

    private Telemetry lastKnownHealthy;
    private volatile boolean healthyBaselineFresh = true;

    public HealthyEngineSimulator(PhysicsServiceClient physicsServiceClient) {
        this.physicsServiceClient = physicsServiceClient;
    }

    @Override
    public Telemetry generateNextTick(SimulationState state, String engineId, String missionId) {
        Instant now = Instant.now();
        if (!seeded) {
            // Matches the offline generator's own initial seed (mission_generator.py's
            // initial_telemetry: ambient+10 for CHT, ambient+5 for oil temperature).
            previousCht = state.getAmbientTemperature() + 10.0;
            previousOilTemperature = state.getAmbientTemperature() + 5.0;
            seeded = true;
        }

        Telemetry context = new Telemetry(
                now, engineId, missionId, state.getMissionPhase(),
                state.getAltitude(), state.getAmbientTemperature(),
                state.getThrottle(), state.getLoad(),
                // Unused by predict_healthy_state's causal chain except cht/oilTemperature
                // (read as the filter's "previous" anchor) — everything else here is a
                // placeholder the Python model does not read as an input.
                0.0, 0.0, previousCht, previousOilTemperature, 0.0, 0.0, 0.0, 14.2
        );

        try {
            PhysicsPrediction prediction = physicsServiceClient.predict(context);
            previousCht = prediction.expectedCht();
            previousOilTemperature = prediction.expectedOilTemperature();
            lastKnownHealthy = new Telemetry(
                    now, engineId, missionId, state.getMissionPhase(),
                    state.getAltitude(), state.getAmbientTemperature(),
                    state.getThrottle(), state.getLoad(),
                    prediction.expectedRpm(), prediction.expectedEgt(), prediction.expectedCht(),
                    prediction.expectedOilTemperature(), prediction.expectedOilPressure(),
                    prediction.expectedFuelFlow(), prediction.expectedVibration(),
                    prediction.expectedBatteryVoltage()
            );
            healthyBaselineFresh = true;
        } catch (PhysicsServiceClient.PhysicsServiceUnavailableException exception) {
            // Deliberately do NOT recompute a healthy baseline locally — that would silently
            // recreate the exact two-implementations divergence this class exists to remove.
            // previousCht/previousOilTemperature are intentionally left unmodified (frozen at
            // their last successful value), and the last known healthy telemetry is reused
            // with a refreshed timestamp so /api/telemetry/current stays available (matching
            // its existing, documented zero-fault-tolerance-required guarantee) without
            // fabricating new physics.
            LOGGER.warn("Physics service unavailable; retaining last known healthy baseline: {}",
                    exception.getMessage());
            healthyBaselineFresh = false;
            if (lastKnownHealthy == null) {
                lastKnownHealthy = bootstrapTelemetry(state, engineId, missionId, now);
            } else {
                lastKnownHealthy = withRefreshedTimestamp(lastKnownHealthy, now);
            }
        }

        return lastKnownHealthy;
    }

    @Override
    public boolean isHealthyBaselineFresh() {
        return healthyBaselineFresh;
    }

    /**
     * Used only if the physics service has never once succeeded (e.g. down since backend
     * startup) — matches the offline generator's own cold-start seed
     * (mission_generator.py's initial_telemetry) rather than inventing new values.
     */
    private Telemetry bootstrapTelemetry(SimulationState state, String engineId, String missionId, Instant now) {
        double ambient = state.getAmbientTemperature();
        return new Telemetry(
                now, engineId, missionId, state.getMissionPhase(),
                state.getAltitude(), ambient, state.getThrottle(), state.getLoad(),
                1000.0, ambient + 20.0, ambient + 10.0, ambient + 5.0,
                240.0, 2.0, 1.5, 14.2
        );
    }

    private Telemetry withRefreshedTimestamp(Telemetry telemetry, Instant now) {
        return new Telemetry(
                now, telemetry.engineId(), telemetry.missionId(), telemetry.missionPhase(),
                telemetry.altitude(), telemetry.ambientTemperature(), telemetry.throttle(), telemetry.load(),
                telemetry.rpm(), telemetry.egt(), telemetry.cht(), telemetry.oilTemperature(),
                telemetry.oilPressure(), telemetry.fuelFlow(), telemetry.vibration(), telemetry.batteryVoltage()
        );
    }
}
