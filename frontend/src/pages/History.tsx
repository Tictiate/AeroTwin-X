import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { HistoryPoint, HistoryRunDetail, HistoryRunSummary } from "../api/types";
import { humanize } from "../lib/status";
import { StatusPill } from "../components/StatusPill";
import { Sparkline } from "../components/Sparkline";

function na(value: string | number | null | undefined, suffix = ""): string {
  return value === null || value === undefined ? "Not available" : `${value}${suffix}`;
}

export default function History() {
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
    <>
      <div className="page-header">
        <span className="eyebrow">History</span>
        <h1>What happened during previous missions?</h1>
        <p>
          Recorded replay runs generated offline by <code className="mono">scripts/replay_rul.py</code>. A recorded
          trajectory from a past run, not a live telemetry stream. Fields the artifact does not contain are shown as
          "Not available."
        </p>
      </div>

      <div className="section">
        <div className="panel">
          {runsError && <div className="state-block critical"><span className="headline">History unavailable</span>{runsError}</div>}
          {!runs && !runsError && <div className="state-block">Loading available replay runs…</div>}

          {runs && runs.length === 0 && <div className="state-block">No replay runs recorded.</div>}

          {runs && runs.length > 0 && (
            <>
              <div style={{ marginBottom: "var(--space-5)" }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Replay run</span>
                <div className="segmented">
                  {runs.map((run) => (
                    <button key={run.scenario} className={scenario === run.scenario ? "active" : ""} onClick={() => setScenario(run.scenario)}>
                      {humanize(run.scenario)}
                    </button>
                  ))}
                </div>
                <span className="note" style={{ display: "block", marginTop: 6, color: "var(--text-tertiary)", fontSize: 12 }}>
                  {runs.find((r) => r.scenario === scenario)?.totalSamples ?? 0} recorded ticks
                </span>
              </div>

              {detailBusy && <div className="state-block">Loading replay run…</div>}
              {detailError && <div className="state-block critical"><span className="headline">Replay unavailable</span>{detailError}</div>}

              {detail && point && (
                <>
                  <p className="note" style={{ color: "var(--text-tertiary)", fontSize: 12, marginBottom: "var(--space-4)" }}>
                    Mission <code className="mono">{na(detail.missionId)}</code> · Engine{" "}
                    <code className="mono">{na(detail.engineId)}</code> · {detail.points.length} of {detail.totalSamples} recorded
                    ticks shown (downsampled for display)
                  </p>

                  <div className="grid-2" style={{ marginBottom: "var(--space-5)" }}>
                    <div className="panel" style={{ padding: "var(--space-4)" }}>
                      <span className="eyebrow">Health trend</span>
                      <div style={{ marginTop: 8 }}><Sparkline values={healthSeries} width={280} /></div>
                    </div>
                    <div className="panel" style={{ padding: "var(--space-4)" }}>
                      <span className="eyebrow">Degradation trend</span>
                      <div style={{ marginTop: 8 }}><Sparkline values={degradationSeries} width={280} /></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "var(--space-5)" }}>
                    <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Timeline position: {point.timestamp}</span>
                    <input
                      type="range"
                      min={0}
                      max={detail.points.length - 1}
                      step={1}
                      value={pointIndex}
                      onChange={(e) => setPointIndex(Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div className="grid-2">
                    <div>
                      <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Engine state at this point</span>
                      <div className="data-row"><span className="label">Health</span><span className="value">{na(point.health?.toFixed(1) ?? null)}</span></div>
                      <div className="data-row">
                        <span className="label">Degradation</span>
                        <span className="value">{na(point.degradation !== null ? (point.degradation * 100).toFixed(1) : null, "%")}</span>
                      </div>
                      <div className="data-row"><span className="label">Dominant mechanism</span><span className="value">{na(point.dominantMechanism ? humanize(point.dominantMechanism) : null)}</span></div>
                      <div className="data-row">
                        <span className="label">Diagnostic type</span>
                        <span className="value"><StatusPill value={point.diagnosticType} /></span>
                      </div>
                      <div className="data-row"><span className="label">Affected sensor</span><span className="value">{na(point.affectedSensor)}</span></div>
                    </div>
                    <div>
                      <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Remaining useful life at this point</span>
                      <div className="data-row">
                        <span className="label">RUL status</span>
                        <span className="value"><StatusPill value={point.rulStatus} /></span>
                      </div>
                      <div className="data-row">
                        <span className="label">RUL estimate</span>
                        <span className="value">
                          {point.rulHours === null
                            ? "Not available"
                            : `${point.rulHours.toFixed(1)}h (${na(point.rulLowerBoundHours?.toFixed(1) ?? null)}–${na(point.rulUpperBoundHours?.toFixed(1) ?? null)})`}
                        </span>
                      </div>
                      <div className="data-row">
                        <span className="label">RUL confidence</span>
                        <span className="value">{na(point.rulConfidence !== null ? (point.rulConfidence * 100).toFixed(0) : null, "%")}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
