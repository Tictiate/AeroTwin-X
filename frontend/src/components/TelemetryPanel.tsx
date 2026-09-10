import type { Telemetry } from "../api/types";
import { Sparkline } from "./Sparkline";

const CHANNELS: Array<{ key: keyof Telemetry; label: string; unit: string; decimals: number }> = [
  { key: "rpm", label: "RPM", unit: "rpm", decimals: 0 },
  { key: "egt", label: "EGT", unit: "°C", decimals: 0 },
  { key: "cht", label: "CHT", unit: "°C", decimals: 0 },
  { key: "oilTemperature", label: "Oil Temp", unit: "°C", decimals: 1 },
  { key: "oilPressure", label: "Oil Pressure", unit: "kPa", decimals: 0 },
  { key: "fuelFlow", label: "Fuel Flow", unit: "L/h", decimals: 1 },
  { key: "vibration", label: "Vibration", unit: "mm/s", decimals: 2 },
  { key: "batteryVoltage", label: "Battery", unit: "V", decimals: 1 },
];

export function TelemetryPanel({
  latest,
  history,
  wsStatus,
}: {
  latest: Telemetry | null;
  history: Telemetry[];
  wsStatus: string;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Live Telemetry</h2>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>1 Hz · WS {wsStatus}</span>
      </div>

      {!latest ? (
        <p className="panel-loading">Waiting for first telemetry frame…</p>
      ) : (
        <>
          <div className="readout-grid">
            {CHANNELS.map(({ key, label, unit, decimals }) => (
              <div className="readout" key={key}>
                <span className="label">{label}</span>
                <span className="value">
                  {(latest[key] as number).toFixed(decimals)}
                  <span className="unit">{unit}</span>
                </span>
                <Sparkline values={history.map((t) => t[key] as number)} />
              </div>
            ))}
          </div>
          <div className="stat-line" style={{ marginTop: 10 }}>
            <span className="k">Context</span>
            <span>
              alt {latest.altitude.toFixed(0)}m · OAT {latest.ambientTemperature.toFixed(0)}°C · throttle{" "}
              {(latest.throttle * 100).toFixed(0)}% · load {(latest.load * 100).toFixed(0)}%
            </span>
          </div>
        </>
      )}
    </section>
  );
}
