package com.aerotwin.simulator;

import com.aerotwin.model.Telemetry;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class HealthyEngineSimulator implements EngineSimulator {

    // First-order state variables
    private double currentCht = 15.0;
    private double currentOilTemp = 15.0;

    // Constants for reduced-order model
    private static final double DISPLACEMENT_L = 2.0;
    private static final double VOLUMETRIC_EFFICIENCY = 0.8;
    private static final double R_SPECIFIC_AIR = 287.05; // J/(kg·K)
    private static final double SEA_LEVEL_PRESSURE_PA = 101325.0;
    private static final double FUEL_DENSITY_KG_L = 0.72;
    
    // Engine parameters
    private static final double IDLE_RPM = 1000.0;
    private static final double MAX_RPM = 6000.0;

    @Override
    public Telemetry generateNextTick(SimulationState state, String engineId, String missionId) {
        Instant now = Instant.now();
        double timeSec = state.getElapsedTimeSeconds();

        // 1. RPM Calculation (throttle increases RPM, load drops it slightly)
        double targetRpm = IDLE_RPM + state.getThrottle() * (MAX_RPM - IDLE_RPM) - state.getLoad() * 500.0;
        double rpm = Math.max(IDLE_RPM, targetRpm);
        // Add tiny deterministic variation
        rpm += Math.sin(timeSec * 2.0) * 10.0;

        // Prototype assumption: pressure follows a simple exponential atmosphere and
        // density follows the ideal gas law. This is not a validated engine model.
        double tempK = state.getAmbientTemperature() + 273.15;
        double pressurePa = SEA_LEVEL_PRESSURE_PA * Math.exp(-0.00012 * state.getAltitude());
        double airDensityKgM3 = pressurePa / (R_SPECIFIC_AIR * tempK);

        // Prototype assumption: intake airflow is displacement, RPM, and fixed
        // volumetric efficiency. The relationships below are reduced-order proxies.
        // Volumetric flow per hour = (RPM / 2) * (Displacement / 1000) * VE * 60
        double volFlowM3H = (rpm / 2.0) * (DISPLACEMENT_L / 1000.0) * VOLUMETRIC_EFFICIENCY * 60.0;
        double airFlowKgH = volFlowM3H * airDensityKgM3;

        // Prototype assumption: throttle changes the commanded fuel-to-air ratio.
        // Fuel flow is then derived from airflow rather than set independently.
        double afr = 14.7 - state.getThrottle() * 2.0;
        double fuelFlowKgH = airFlowKgH / afr;
        double fuelFlowLh = fuelFlowKgH / FUEL_DENSITY_KG_L;

        // Prototype assumption: fuel mass flow represents combustion heat release;
        // EGT is a temperature proxy with a small deterministic periodic variation.
        double heatReleaseProxy = fuelFlowKgH * 43000.0;
        double egt = state.getAmbientTemperature() + (heatReleaseProxy / 1000.0);
        egt += Math.sin(timeSec * 3.0) * 5.0;

        // 6. CHT (Thermal inertia: follows EGT)
        double targetCht = state.getAmbientTemperature() + (egt * 0.25);
        // First order filter (alpha ~ 0.05 per tick assuming 1s tick)
        currentCht += (targetCht - currentCht) * 0.05;

        // Prototype assumption: oil heat input follows RPM/load and cooling improves
        // with colder ambient air and altitude (used as an airspeed proxy).
        double cooling = Math.max(0.2, 1.0 + state.getAltitude() / 10000.0);
        double targetOilTemp = state.getAmbientTemperature()
            + ((rpm * 0.015) + (state.getLoad() * 20.0)) / cooling;
        // First order filter (alpha ~ 0.02)
        currentOilTemp += (targetOilTemp - currentOilTemp) * 0.02;

        // 8. Oil Pressure (kPa)
        // Base pressure from oil pump driven by RPM
        double oilPressure = 200.0 + (rpm * 0.05);
        // Viscosity drops at high temperatures, lowering pressure
        if (currentOilTemp > 80.0) {
            oilPressure -= (currentOilTemp - 80.0) * 2.0;
        }
        oilPressure += Math.sin(timeSec) * 2.0; // small deterministic ripple
        oilPressure = Math.max(50.0, oilPressure); // min bounds

        // 9. Vibration (mm/s RMS)
        // Proportional to RPM, worse at high load
        double vibration = (rpm / 1000.0) * 1.5 + (state.getLoad() * 2.0);
        vibration += Math.cos(timeSec * 5.0) * 0.5;

        return new Telemetry(
                now,
                engineId,
                missionId,
                state.getMissionPhase(),
                state.getAltitude(),
                state.getAmbientTemperature(),
                state.getThrottle(),
                state.getLoad(),
                rpm,
                egt,
                currentCht,
                currentOilTemp,
                oilPressure,
                fuelFlowLh,
                vibration,
                14.2 // constant battery voltage for now
        );
    }
}
