package com.aerotwin.simulator;

import com.aerotwin.model.FaultType;
import com.aerotwin.model.MissionPhase;

public class SimulationState {
    private MissionPhase missionPhase = MissionPhase.IDLE;
    private double altitude = 0.0;
    private double ambientTemperature = 15.0; // Standard day
    private double throttle = 0.0;
    private double load = 0.0;
    private double elapsedTimeSeconds = 0.0;

    // Live fault-injection control (see FaultInjectionServiceClient / SimulatorController).
    private FaultType activeFaultType = FaultType.NORMAL;
    private Double faultSeverityOverride = null;
    private double faultActivatedAtSeconds = 0.0;

    // Getters and Setters

    public MissionPhase getMissionPhase() {
        return missionPhase;
    }

    public void setMissionPhase(MissionPhase missionPhase) {
        this.missionPhase = missionPhase;
    }

    public double getAltitude() {
        return altitude;
    }

    public void setAltitude(double altitude) {
        this.altitude = altitude;
    }

    public double getAmbientTemperature() {
        return ambientTemperature;
    }

    public void setAmbientTemperature(double ambientTemperature) {
        this.ambientTemperature = ambientTemperature;
    }

    public double getThrottle() {
        return throttle;
    }

    public void setThrottle(double throttle) {
        this.throttle = Math.max(0.0, Math.min(1.0, throttle));
    }

    public double getLoad() {
        return load;
    }

    public void setLoad(double load) {
        this.load = Math.max(0.0, Math.min(1.0, load));
    }

    public double getElapsedTimeSeconds() {
        return elapsedTimeSeconds;
    }

    public void advanceTime(double seconds) {
        if (seconds < 0.0) {
            throw new IllegalArgumentException("Simulation time cannot move backwards");
        }
        elapsedTimeSeconds += seconds;
    }

    public FaultType getActiveFaultType() {
        return activeFaultType;
    }

    public Double getFaultSeverityOverride() {
        return faultSeverityOverride;
    }

    /**
     * Activates a fault (or resets to healthy if faultType is NORMAL/null). The fault's
     * internal clock restarts at 0, matching how the offline dataset generator's
     * FaultSchedule is anchored to the start of each run rather than to mission time.
     */
    public void activateFault(FaultType faultType, Double severityOverride) {
        this.activeFaultType = faultType == null ? FaultType.NORMAL : faultType;
        this.faultSeverityOverride = this.activeFaultType == FaultType.NORMAL ? null : severityOverride;
        this.faultActivatedAtSeconds = this.elapsedTimeSeconds;
    }

    public void resetToHealthy() {
        activateFault(FaultType.NORMAL, null);
    }

    public double getElapsedFaultSeconds() {
        return Math.max(0.0, elapsedTimeSeconds - faultActivatedAtSeconds);
    }
}
