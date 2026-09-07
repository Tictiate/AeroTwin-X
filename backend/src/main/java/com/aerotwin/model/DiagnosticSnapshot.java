package com.aerotwin.model;

public record DiagnosticSnapshot(
        Telemetry telemetry,
        PhysicsPrediction physicsPrediction,
        PhysicsResidual residuals,
        MLAnalysis analysis,
        HealthResult health,
        DegradationState degradation,
        RulEstimate rul
) {
    public DiagnosticSnapshot(
            Telemetry telemetry,
            PhysicsPrediction physicsPrediction,
            PhysicsResidual residuals,
            MLAnalysis analysis) {
        this(telemetry, physicsPrediction, residuals, analysis, null, null, null);
    }

    public DiagnosticSnapshot(
            Telemetry telemetry,
            PhysicsPrediction physicsPrediction,
            PhysicsResidual residuals,
            MLAnalysis analysis,
            HealthResult health) {
        this(telemetry, physicsPrediction, residuals, analysis, health, null, null);
    }
}