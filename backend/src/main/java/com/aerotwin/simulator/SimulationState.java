package com.aerotwin.simulator;

import com.aerotwin.model.MissionPhase;

public class SimulationState {
    private MissionPhase missionPhase = MissionPhase.IDLE;
    private double altitude = 0.0;
    private double ambientTemperature = 15.0; // Standard day
    private double throttle = 0.0;
    private double load = 0.0;
    private double elapsedTimeSeconds = 0.0;

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
}
