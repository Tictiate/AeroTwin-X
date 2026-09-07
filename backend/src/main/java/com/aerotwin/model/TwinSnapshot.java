package com.aerotwin.model;

public record TwinSnapshot(
        Telemetry telemetry,
        PhysicsPrediction prediction,
        PhysicsResidual residuals
) {}