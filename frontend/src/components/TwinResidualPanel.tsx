import type { PhysicsPrediction, PhysicsResidual, Telemetry } from "../api/types";
import { DivergeBar } from "./Bar";

const CHANNELS: Array<{
  actual: keyof Telemetry;
  expected: keyof PhysicsPrediction;
  residual: keyof PhysicsResidual;
  normalized: keyof PhysicsResidual;
  label: string;
  decimals: number;
}> = [
  { actual: "rpm", expected: "expectedRpm", residual: "rpmResidual", normalized: "normalizedRpmResidual", label: "RPM", decimals: 0 },
  { actual: "egt", expected: "expectedEgt", residual: "egtResidual", normalized: "normalizedEgtResidual", label: "EGT", decimals: 0 },
  { actual: "cht", expected: "expectedCht", residual: "chtResidual", normalized: "normalizedChtResidual", label: "CHT", decimals: 0 },
  { actual: "oilTemperature", expected: "expectedOilTemperature", residual: "oilTemperatureResidual", normalized: "normalizedOilTemperatureResidual", label: "Oil Temp", decimals: 1 },
  { actual: "oilPressure", expected: "expectedOilPressure", residual: "oilPressureResidual", normalized: "normalizedOilPressureResidual", label: "Oil Pressure", decimals: 0 },
  { actual: "fuelFlow", expected: "expectedFuelFlow", residual: "fuelFlowResidual", normalized: "normalizedFuelFlowResidual", label: "Fuel Flow", decimals: 1 },
  { actual: "vibration", expected: "expectedVibration", residual: "vibrationResidual", normalized: "normalizedVibrationResidual", label: "Vibration", decimals: 2 },
];

export function TwinResidualPanel({
  telemetry,
  prediction,
  residuals,
}: {
  telemetry: Telemetry;
  prediction: PhysicsPrediction;
  residuals: PhysicsResidual;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Physics Twin — Actual vs Expected</h2>
      </div>

      <table className="twin-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Actual</th>
            <th>Expected</th>
            <th>Residual</th>
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map((c) => {
            const residual = residuals[c.residual] as number;
            return (
              <tr key={c.label}>
                <td className="label">{c.label}</td>
                <td>{(telemetry[c.actual] as number).toFixed(c.decimals)}</td>
                <td>{(prediction[c.expected] as number).toFixed(c.decimals)}</td>
                <td className={residual >= 0 ? "residual-pos" : "residual-neg"}>
                  {residual >= 0 ? "+" : ""}
                  {residual.toFixed(c.decimals)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 14 }}>
        <div className="panel-title" style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 10.5 }}>Normalized residual (fraction of physical operating range)</h2>
        </div>
        {CHANNELS.map((c) => (
          <DivergeBar key={c.label} label={c.label} value={residuals[c.normalized] as number} limit={0.5} />
        ))}
      </div>
    </section>
  );
}
