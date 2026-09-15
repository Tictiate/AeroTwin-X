import type { PhysicsPrediction, PhysicsResidual, Telemetry } from "../api/types";

export interface ResidualChannel {
  actual: keyof Telemetry;
  expected: keyof PhysicsPrediction;
  residual: keyof PhysicsResidual;
  normalized: keyof PhysicsResidual;
  label: string;
  decimals: number;
  unit?: string;
}

/**
 * Single source of truth for the actual/expected/residual channel mapping --
 * shared by the Overview and Diagnostics "actual vs expected" visualizations
 * so both read the same real physics-residual fields.
 */
export const RESIDUAL_CHANNELS: ResidualChannel[] = [
  { actual: "rpm", expected: "expectedRpm", residual: "rpmResidual", normalized: "normalizedRpmResidual", label: "RPM", decimals: 0 },
  { actual: "egt", expected: "expectedEgt", residual: "egtResidual", normalized: "normalizedEgtResidual", label: "EGT", decimals: 0, unit: "°C" },
  { actual: "cht", expected: "expectedCht", residual: "chtResidual", normalized: "normalizedChtResidual", label: "CHT", decimals: 0, unit: "°C" },
  { actual: "oilTemperature", expected: "expectedOilTemperature", residual: "oilTemperatureResidual", normalized: "normalizedOilTemperatureResidual", label: "Oil Temp", decimals: 1, unit: "°C" },
  { actual: "oilPressure", expected: "expectedOilPressure", residual: "oilPressureResidual", normalized: "normalizedOilPressureResidual", label: "Oil Pressure", decimals: 0, unit: "kPa" },
  { actual: "fuelFlow", expected: "expectedFuelFlow", residual: "fuelFlowResidual", normalized: "normalizedFuelFlowResidual", label: "Fuel Flow", decimals: 1 },
  { actual: "vibration", expected: "expectedVibration", residual: "vibrationResidual", normalized: "normalizedVibrationResidual", label: "Vibration", decimals: 2 },
];

const OVERVIEW_LABELS = new Set(["EGT", "CHT", "Oil Pressure", "Vibration"]);

/** Compact subset surfaced on Overview -- the full list stays on Diagnostics. */
export const OVERVIEW_RESIDUAL_CHANNELS: ResidualChannel[] = RESIDUAL_CHANNELS.filter((c) =>
  OVERVIEW_LABELS.has(c.label)
);
