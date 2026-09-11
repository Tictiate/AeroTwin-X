/**
 * These types mirror the Java backend records exactly (field-for-field), verified against
 * backend/src/main/java/com/aerotwin/model/**. Do not invent fields here — if the backend
 * contract changes, update this file to match, not the other way around.
 */

export type MissionPhaseName =
  | "IDLE"
  | "TAKEOFF"
  | "CLIMB"
  | "CRUISE"
  | "LOITER"
  | "DESCENT"
  | "LANDING";

export interface Telemetry {
  timestamp: string;
  engineId: string;
  missionId: string;
  missionPhase: MissionPhaseName;
  altitude: number;
  ambientTemperature: number;
  throttle: number;
  load: number;
  rpm: number;
  egt: number;
  cht: number;
  oilTemperature: number;
  oilPressure: number;
  fuelFlow: number;
  vibration: number;
  batteryVoltage: number;
}

export interface PhysicsPrediction {
  expectedRpm: number;
  expectedEgt: number;
  expectedCht: number;
  expectedOilTemperature: number;
  expectedOilPressure: number;
  expectedFuelFlow: number;
  expectedVibration: number;
  expectedBatteryVoltage: number;
}

export interface PhysicsResidual {
  timestamp: string;
  engineId: string;
  missionId: string;
  rpmResidual: number;
  egtResidual: number;
  chtResidual: number;
  oilTemperatureResidual: number;
  oilPressureResidual: number;
  fuelFlowResidual: number;
  vibrationResidual: number;
  normalizedRpmResidual: number;
  normalizedEgtResidual: number;
  normalizedChtResidual: number;
  normalizedOilTemperatureResidual: number;
  normalizedOilPressureResidual: number;
  normalizedFuelFlowResidual: number;
  normalizedVibrationResidual: number;
}

export interface FeatureContributor {
  feature: string;
  value: number;
  shapValue: number;
  direction: string;
  description: string;
}

export interface DiagnosticExplanation {
  predictedFault: string;
  classifierConfidence: number;
  explanationAvailable: boolean;
  topContributors: FeatureContributor[];
  operatorSummary: string;
}

export interface MLAnalysis {
  anomaly: boolean;
  anomalyScore: number;
  predictedFault: string;
  faultProbabilities: Record<string, number>;
  modelVersion: string;
  explanation: DiagnosticExplanation | null;
}

export interface HealthTrend {
  direction: string;
  ratePerHour: number;
}

export interface SensorHealthResult {
  health: number;
  status: string;
  confidence: number;
  reason: string;
}

export interface HealthContributor {
  factor: string;
  impact: number;
}

export interface HealthResult {
  overallHealth: number;
  status: string;
  subsystems: Record<string, number>;
  trend: HealthTrend;
  sensorHealth: Record<string, SensorHealthResult>;
  contributors: HealthContributor[];
  diagnosticType: string;
  affectedSensor: string | null;
  faultType: string | null;
  diagnosticConfidence: number;
}

export interface DegradationState {
  timestamp: string;
  engineId: string;
  overallHealth: number;
  overallDegradation: number;
  componentDegradation: Record<string, number>;
  sensorQualityDegradation: number;
  degradationRatePerHour: number;
  dominantMechanism: string;
  trend: string;
  confidence: number;
  dataQuality: string;
  historySamples: number;
}

export interface RulEstimate {
  rulHours: number | null;
  lowerBoundHours: number | null;
  upperBoundHours: number | null;
  confidence: number;
  status: string;
  eolHealthThreshold: number;
  degradationRatePerHour: number;
  explanation: string;
}

export interface TwinSnapshot {
  telemetry: Telemetry;
  prediction: PhysicsPrediction;
  residuals: PhysicsResidual;
}

export interface DiagnosticSnapshot {
  telemetry: Telemetry;
  physicsPrediction: PhysicsPrediction;
  residuals: PhysicsResidual;
  analysis: MLAnalysis;
  health: HealthResult | null;
  degradation: DegradationState | null;
  rul: RulEstimate | null;
}

// ── Mission ────────────────────────────────────────────────────────────────

export interface MissionPhaseSpec {
  phase: string;
  durationSeconds: number;
  altitudeStart: number;
  altitudeEnd: number;
  throttle: number;
  load: number;
  ambientTemperature: number;
}

export interface MissionProfile {
  missionId: string;
  phases: MissionPhaseSpec[];
}

export interface MissionPhaseResult {
  phase: string;
  durationSeconds: number;
  startHealth: number;
  endHealth: number;
  minimumHealth: number;
  degradationIncrease: number;
  phaseRiskScore: number;
  riskBand: string;
}

export interface MissionSimulationResult {
  missionId: string;
  totalDurationSeconds: number;
  missionRiskScore: number;
  missionReliabilityScore: number;
  riskBand: string;
  operatorRecommendation: string;
  operatorRationale: string;
  projectedEndHealth: number;
  minimumProjectedHealth: number;
  criticalPhase: string;
  estimatedFailureTimeSeconds: number | null;
  phaseResults: MissionPhaseResult[];
  finalComponentDegradation: Record<string, number>;
  sensorObservabilityRisk: number;
}

export interface WhatIfScenario {
  cruiseDurationMultiplier: number;
  loadDelta: number;
  throttleDelta: number;
  selectedPhases: string[];
  faultTypeOverride: string | null;
}

export interface WhatIfDelta {
  risk: number;
  reliability: number;
  endHealth: number;
  minimumHealth: number;
}

export interface WhatIfResult {
  baseline: MissionSimulationResult;
  scenario: MissionSimulationResult;
  delta: WhatIfDelta;
  interpretation: string;
}

// ── Mission History / Replay ────────────────────────────────────────────

export interface HistoryRunSummary {
  scenario: string;
  missionId: string | null;
  engineId: string | null;
  totalSamples: number;
}

export interface HistoryPoint {
  timestamp: string;
  health: number | null;
  degradation: number | null;
  degradationRatePerHour: number | null;
  dominantMechanism: string | null;
  rulHours: number | null;
  rulLowerBoundHours: number | null;
  rulUpperBoundHours: number | null;
  rulConfidence: number | null;
  rulStatus: string | null;
  diagnosticType: string | null;
  affectedSensor: string | null;
}

export interface HistoryRunDetail extends HistoryRunSummary {
  points: HistoryPoint[];
}

// ── Live simulator fault control ──────────────────────────────────────────

export type FaultTypeName =
  | "NORMAL"
  | "INJECTOR_DEGRADATION"
  | "LUBRICATION_DEGRADATION"
  | "MISFIRE"
  | "SENSOR_DRIFT";

export interface SimulatorFaultState {
  faultType: FaultTypeName;
  severityOverride: number | null;
  elapsedFaultSeconds: number;
  active: boolean;
}

// ── Error envelope ───────────────────────────────────────────────────────

export interface ServiceUnavailableBody {
  status: string;
  message: string;
  telemetry?: Telemetry;
  physicsPrediction?: PhysicsPrediction;
  residuals?: PhysicsResidual;
  analysis?: MLAnalysis;
}
