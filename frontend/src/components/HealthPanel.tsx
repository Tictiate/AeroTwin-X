import type { HealthResult } from "../api/types";
import { statusTier } from "../lib/status";
import { Bar } from "./Bar";
import { StatusPill } from "./StatusPill";

function tierFor(score: number) {
  if (score >= 90) return "healthy" as const;
  if (score >= 75) return "caution" as const;
  if (score >= 50) return "degraded" as const;
  return "critical" as const;
}

export function HealthPanel({ health }: { health: HealthResult | null }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Engine Health</h2>
        {health && <StatusPill value={health.status} />}
      </div>

      {!health ? (
        <p className="panel-empty">Health index unavailable.</p>
      ) : (
        <>
          <div className="big-stat">
            <span className="value" style={{ color: `var(--status-${statusTier(health.status)})` }}>
              {health.overallHealth.toFixed(1)}
            </span>
            <span className="unit">/ 100 · trend {health.trend.direction.toLowerCase()}</span>
          </div>

          <div style={{ marginTop: 14 }}>
            {Object.entries(health.subsystems).map(([name, score]) => (
              <Bar key={name} label={name} value={score} tier={tierFor(score)} formatValue={(v) => v.toFixed(0)} />
            ))}
          </div>

          {health.contributors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="panel-title" style={{ marginBottom: 6 }}>
                <h2 style={{ fontSize: 10.5 }}>Top health contributors</h2>
              </div>
              {health.contributors.slice(0, 4).map((c) => (
                <div key={c.factor} className="stat-line">
                  <span className="k">{c.factor}</span>
                  <span>{c.impact > 0 ? "+" : ""}{c.impact.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
