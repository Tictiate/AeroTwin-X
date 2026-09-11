import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { HistoryPoint, HistoryRunDetail, HistoryRunSummary } from "../api/types";
import { humanize } from "../lib/status";
import { StatusPill } from "./StatusPill";
import { Sparkline } from "./Sparkline";

function na(value: string | number | null | undefined, suffix = ""): string {
  return value === null || value === undefined ? "Not available" : `${value}${suffix}`;
}

export function MissionHistoryPanel() {
  const [runs, setRuns] = useState<HistoryRunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryRunDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [pointIndex, setPointIndex] = useState(0);

  useEffect(() => {
    api
      .listMissionHistory()
      .then((list) => {
        setRuns(list);
        if (list.length > 0) setScenario(list[0].scenario);
      })
      .catch((error) => setRunsError(error instanceof Error ? error.message : "Failed to load mission history list"));
  }, []);

  useEffect(() => {
    if (!scenario) return;
    setDetailBusy(true);
    setDetailError(null);
    api
      .getMissionHistoryRun(scenario)
      .then((run) => {
        setDetail(run);
        setPointIndex(run.points.length - 1);
      })
      .catch((error) => setDetailError(error instanceof ApiError ? error.message : "Failed to load replay run"))
      .finally(() => setDetailBusy(false));
  }, [scenario]);

  const point: HistoryPoint | null = detail && detail.points.length > 0 ? detail.points[pointIndex] : null;
  const healthSeries = detail ? detail.points.map((p) => p.health ?? 0) : [];
  const degradationSeries = detail ? detail.points.map((p) => (p.degradation ?? 0) * 100) : [];

  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <h2>Mission History / Replay</h2>
        <span className="pill status-unknown" title="This panel shows a recorded replay run, not the live engine">
          HISTORICAL — NOT LIVE
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: -6, marginBottom: 12 }}>
        Real, committed replay artifacts generated offline by <code>scripts/replay_rul.py</code> (
        <code>data/generated/rul/</code>) — a recorded trajectory from a past run, not a live telemetry stream. Fields
        the artifact doesn't contain (e.g. raw telemetry) are not shown here.
      </p>

      {runsError && <p className="panel-error">{runsError}</p>}
      {!runs && !runsError && <p className="panel-loading">Loading available replay runs…</p>}

      {runs && (
        <>
          <div className="mission-controls" style={{ marginBottom: 12 }}>
            <div className="control-group">
              <label>Replay run</label>
              <select value={scenario ?? ""} onChange={(e) => setScenario(e.target.value)}>
                {runs.map((run) => (
                  <option key={run.scenario} value={run.scenario}>
                    {humanize(run.scenario)} ({run.totalSamples} recorded ticks)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {detailBusy && <p className="panel-loading">Loading replay run…</p>}
          {detailError && <p className="panel-error">{detailError}</p>}

          {detail && point && (
            <>
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                Mission <code>{na(detail.missionId)}</code> · Engine <code>{na(detail.engineId)}</code> ·{" "}
                {detail.points.length} of {detail.totalSamples} recorded ticks shown (downsampled for display)
              </p>

              <div className="delta-strip" style={{ marginBottom: 10 }}>
                <div className="delta-item">
                  <span className="k">Health trend</span>
                  <Sparkline values={healthSeries} />
                </div>
                <div className="delta-item">
                  <span className="k">Degradation trend</span>
                  <Sparkline values={degradationSeries} />
                </div>
              </div>

              <div className="control-group" style={{ marginBottom: 10 }}>
                <label>Replay position: {point.timestamp}</label>
                <input
                  type="range"
                  min={0}
                  max={detail.points.length - 1}
                  step={1}
                  value={pointIndex}
                  onChange={(e) => setPointIndex(Number(e.target.value))}
                />
              </div>

              <div className="delta-strip">
                <div className="delta-item">
                  <span className="k">Health</span>
                  <span className="v">{na(point.health?.toFixed(1) ?? null)}</span>
                </div>
                <div className="delta-item">
                  <span className="k">Degradation</span>
                  <span className="v">{na(point.degradation !== null ? (point.degradation * 100).toFixed(1) : null, "%")}</span>
                </div>
                <div className="delta-item">
                  <span className="k">Dominant mechanism</span>
                  <span className="v">{na(point.dominantMechanism ? humanize(point.dominantMechanism) : null)}</span>
                </div>
                <div className="delta-item">
                  <span className="k">Diagnostic type</span>
                  <StatusPill value={point.diagnosticType} />
                </div>
                <div className="delta-item">
                  <span className="k">Affected sensor</span>
                  <span className="v">{na(point.affectedSensor)}</span>
                </div>
              </div>

              <div className="delta-strip" style={{ marginTop: 8 }}>
                <div className="delta-item">
                  <span className="k">RUL status</span>
                  <StatusPill value={point.rulStatus} />
                </div>
                <div className="delta-item">
                  <span className="k">RUL estimate</span>
                  <span className="v">
                    {point.rulHours === null
                      ? "Not available"
                      : `${point.rulHours.toFixed(1)}h (${na(point.rulLowerBoundHours?.toFixed(1) ?? null)}–${na(point.rulUpperBoundHours?.toFixed(1) ?? null)})`}
                  </span>
                </div>
                <div className="delta-item">
                  <span className="k">RUL confidence</span>
                  <span className="v">{na(point.rulConfidence !== null ? (point.rulConfidence * 100).toFixed(0) : null, "%")}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
