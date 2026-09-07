package com.aerotwin.model;

import java.time.Instant;

public record Telemetry(
        Instant timestamp,
        String engineId,
        String missionId,
        MissionPhase missionPhase,
        double altitude,          // meters
        double ambientTemperature,// Celsius
        double throttle,          // 0.0 - 1.0
        double load,              // 0.0 - 1.0
        double rpm,               // revolutions per minute
        double egt,               // Exhaust Gas Temperature in Celsius
        double cht,               // Cylinder Head Temperature in Celsius
        double oilTemperature,    // Celsius
        double oilPressure,       // kPa
        double fuelFlow,          // liters per hour
        double vibration,         // mm/s RMS
        double batteryVoltage     // Volts
) {}
