import { useDiagnostics } from "./hooks/useDiagnostics";
import { useTelemetryStream } from "./hooks/useTelemetryStream";
import { Header } from "./components/Header";
import { AlertBanner } from "./components/AlertBanner";
import { HealthPanel } from "./components/HealthPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { TwinResidualPanel } from "./components/TwinResidualPanel";
import { DiagnosisPanel } from "./components/DiagnosisPanel";
import { SensorIsolationPanel } from "./components/SensorIsolationPanel";
import { DegradationRulPanel } from "./components/DegradationRulPanel";
import { MissionSection } from "./components/MissionSection";
import { SimulatorControlPanel } from "./components/SimulatorControlPanel";

export default function App() {
  const diagnostics = useDiagnostics();
  const stream = useTelemetryStream();

  const snapshot = diagnostics.kind === "ok" ? diagnostics.snapshot : null;
  const fallbackTelemetry =
    snapshot?.telemetry ?? (diagnostics.kind === "unavailable" ? diagnostics.body.telemetry ?? null : null);
  const effectiveTelemetry = stream.latest ?? fallbackTelemetry ?? null;

  return (
    <div className="console">
      <Header telemetry={effectiveTelemetry} wsStatus={stream.status} />
      <SimulatorControlPanel />
      <AlertBanner state={diagnostics} />

      <div className="grid">
        <HealthPanel health={snapshot?.health ?? null} />
        <TelemetryPanel latest={stream.latest ?? fallbackTelemetry} history={stream.history} wsStatus={stream.status} />
        {snapshot ? (
          <TwinResidualPanel
            telemetry={snapshot.telemetry}
            prediction={snapshot.physicsPrediction}
            residuals={snapshot.residuals}
          />
        ) : (
          <section className="panel">
            <div className="panel-title">
              <h2>Physics Twin — Actual vs Expected</h2>
            </div>
            <p className="panel-empty">Waiting for a full diagnostics snapshot…</p>
          </section>
        )}
        {snapshot ? (
          <DiagnosisPanel analysis={snapshot.analysis} />
        ) : (
          <section className="panel">
            <div className="panel-title">
              <h2>AI Diagnosis</h2>
            </div>
            <p className="panel-empty">Waiting for a full diagnostics snapshot…</p>
          </section>
        )}
        <SensorIsolationPanel health={snapshot?.health ?? null} />
        <DegradationRulPanel degradation={snapshot?.degradation ?? null} rul={snapshot?.rul ?? null} />
      </div>

      <MissionSection
        currentDegradation={snapshot?.degradation ?? null}
        initialRulHours={snapshot?.rul?.rulHours ?? null}
      />

      <p className="footer-note">
        AeroTwin-X is a physics-constrained synthetic-telemetry prototype for SIH 2026. Health, degradation, RUL and
        mission risk figures are prototype engineering estimates, not certified aircraft maintenance predictions.
      </p>
    </div>
  );
}
