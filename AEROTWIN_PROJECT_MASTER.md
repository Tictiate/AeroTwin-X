# AeroTwin-X Project Master

**Living source of truth for AeroTwin-X (SIH 2026).** Read this file first in every session. Update it after every meaningful change. Never mark something complete without evidence recorded here.

- **Audit date:** 2026-09-09 (full repo audit + BUG-1 fix)
- **Last updated:** 2026-09-10 (overnight sprint: FINDING-5 secondary contributors quantified/closed as document-only; BUG-3 (WS timestamp) FIXED; new sensor-isolation false-positive bug found and FIXED; README demo-startup gap fixed; full live fault-sequence + recovery re-verified; anomaly threshold unchanged throughout)
- **Auditor/Developer:** AeroTwin-X engineering team
- **Repo root:** `E:\projectsN\AeroTwin-X`
- **Branch:** `main` @ `904dabe` ("Mid-dev phase 9")
- **Method:** Live code inspection + fresh environment build + live running services (Java on :8080, Python on :8000, and as of session 2, the frontend dev server on :5173) + full test suites executed, not assumed.

---

## 1. Project Overview

AeroTwin-X is a physics-informed digital twin for MALE UAV aero piston engines, targeting SIH 2026. Two services exist today:

- **Java 21 / Spring Boot 3.3 backend** (`backend/`) — telemetry simulation, WebSocket stream, REST API, orchestrates calls to the Python service, owns error/503 handling.
- **Python 3.12 / FastAPI physics service** (`physics-service/`) — physics twin, residuals, ML (anomaly + fault classification + SHAP), health index, sensor isolation, degradation/RUL, mission simulation & what-if, mission risk.

**There is no frontend in this repository.** See §11/§30 — this is the single biggest gap versus the project's stated identity and versus the historical developer report.

## 2. Current Development Status

| Layer | Status |
|---|---|
| Physics twin + residuals | IMPLEMENTED + VERIFIED (live), plus a documented CHT/oil-temp residual-damping property found session 4 (§15.3) |
| Live fault injection (primary chain) | IMPLEMENTED + VERIFIED (session 4) — `/api/simulator/fault`, real onset/ramp, telemetry/residuals confirmed live for all 4 faults; downstream diagnosis PARTIAL (see below) |
| ML diagnostic history wiring | IMPLEMENTED + VERIFIED (session 5) — `MLServiceClient` now sends real rolling history to `/ml/analyze`, confirmed via direct request-body instrumentation and dedicated Python/Java tests, see §15.4 |
| ML anomaly/classification/SHAP | IMPLEMENTED + VERIFIED. Classifier confidence 97-98% for all 3 physical faults (FINDING-4, resolved session 7). Anomaly gate investigated session 8 (§15.7): offline separability is near-chance (AUC~0.59), uniform across all 4 fault types — threshold unchanged, defensible. **FINDING-5** (live/offline anomaly-score gap) root-caused to 3 mechanisms (§15.8) and the primary one — REST-poll-driven history sampling — **fixed and verified session 8** (§15.9): `DiagnosticService` history is now scheduler-driven at 1Hz, poll-rate-independent (causally confirmed). Two smaller secondary contributors (zero live telemetry noise, permanent `missionPhase=IDLE`) remain, documented, not fixed |
| Health + sensor isolation | IMPLEMENTED + VERIFIED (live); session 4 found a real live-only gap — sensor isolation didn't trigger for the multi-channel Sensor Drift fault in a 340s live run (§15.3 Finding 3) despite working offline |
| Degradation + RUL | IMPLEMENTED + VERIFIED (live), correctly withholds fabricated RUL — reconfirmed under live fault conditions session 4 |
| Mission simulation / what-if / risk | IMPLEMENTED + VERIFIED (live), including all 4 fault types (session 3) |
| Mission replay (offline script) | IMPLEMENTED + VERIFIED (tests), isolates missions correctly |
| Live mission history isolation (Java, in-process) | MISSING (single unbounded history deque, no mission-boundary reset — fault-activation history reset added session 4 is a related but distinct mechanism, see §15.3) |
| Java error propagation | IMPLEMENTED + VERIFIED — P0 bug fixed session 1, re-confirmed session 2 |
| Frontend | IMPLEMENTED + VERIFIED (session 2), fault-scenario mission selector added session 3, live simulator fault control panel added session 4, real-browser QA performed + 1 wording bug fixed final sprint (§15.12) — Vite/React/TS console consuming live backend data, see §11 |
| Docker/deployment | MISSING (not required yet) |

## 3. Repository Structure

```
AeroTwin-X/
├── README.md                     — accurate, phase-by-phase, admirably honest about prototype limits
├── .vscode/settings.json
├── backend/                      — Java 21 / Spring Boot 3.3.0 Maven project
│   ├── pom.xml
│   ├── mvnw, mvnw.cmd, .mvn/
│   ├── src/main/java/com/aerotwin/
│   │   ├── AeroTwinApplication.java
│   │   ├── config/                (CorsConfig, WebSocketConfig)
│   │   ├── controller/             (7 REST controllers + 1 WS handler)
│   │   ├── model/                  (Telemetry, TwinSnapshot, DiagnosticSnapshot, Health/Degradation/Rul DTOs, mission/* DTOs)
│   │   ├── service/                 (5 upstream HTTP clients + DiagnosticService, ResidualService, SimulationService, TwinService)
│   │   └── simulator/               (EngineSimulator, HealthyEngineSimulator, SimulationState)
│   ├── src/test/java/...            (21 tests, all controller/service/simulator layers)
│   └── target/                      — ⚠ BUILD OUTPUT COMMITTED TO GIT (see §20)
├── physics-service/               — Python 3.12 / FastAPI
│   ├── main.py                      (router wiring)
│   ├── requirements.txt
│   ├── api/routes/                  (health, predict, ml, health_analysis, degradation, mission)
│   ├── app/
│   │   ├── physics/                  (airflow, combustion, constants, engine_model, environment, predictions, thermal)
│   │   ├── simulation/                (dataset_generator, fault_models, mission_generator)
│   │   ├── features/                  (feature_engineering, feature_schema)
│   │   ├── ml/                        (anomaly_detector, fault_classifier, inference, explainability/SHAP, training)
│   │   ├── health/                    (health_calculator — subsystem scoring + sensor isolation)
│   │   ├── degradation/               (degradation_estimator — trend + RUL)
│   │   └── mission/                   (mission_model, mission_simulator, mission_risk, what_if)
│   ├── scripts/                      (generate_dataset.py, analyze_residuals.py, replay_rul.py)
│   ├── tests/                        (11 files, 56 tests)
│   └── data/generated/, data/models/ — gitignored, regenerated locally this session
├── frontend/                      — Vite / React 18 / TypeScript console (NEW, session 2)
│   ├── package.json, vite.config.ts, tsconfig.json, index.html
│   └── src/
│       ├── api/                      (types.ts — DTOs mirrored field-for-field from the Java records; client.ts — typed fetch wrapper + ApiError)
│       ├── hooks/                     (useDiagnostics.ts — 2s poll of /api/diagnostics/current; useTelemetryStream.ts — WS client with reconnect)
│       ├── lib/status.ts               (shared status-string → color-tier mapping)
│       ├── components/                  (Header, AlertBanner, HealthPanel, TelemetryPanel, TwinResidualPanel, DiagnosisPanel, SensorIsolationPanel, DegradationRulPanel, MissionSection, Bar, Sparkline, StatusPill)
│       ├── styles/index.css             (hand-written dark "ops console" theme, no CSS framework)
│       └── App.tsx, main.tsx
└── AEROTWIN_PROJECT_MASTER.md     — this file

`docker/` and CI config still do not exist (unchanged, not required yet). Root `.gitignore` still does not exist (unchanged, see §20).

## 4. Architecture

Verified live, end-to-end, matches the README's causal chain:

```
Telemetry (Java, deterministic sim)
  → POST /physics/predict (Python)          [expected state]
  → Java computes residuals (ResidualService)
  → POST /ml/analyze (Python)                [anomaly + fault probs + SHAP if anomalous]
  → POST /health/evaluate (Python)           [6-subsystem health + sensor isolation]
  → POST /degradation/evaluate (Python)      [trend + RUL, honest INSUFFICIENT_HISTORY/STABLE]
  → Java assembles DiagnosticSnapshot, keeps 60-sample in-memory history
  → GET /api/{twin,diagnostics,health,degradation,rul}/current
  → (no frontend consumes this today)
Mission: POST /api/mission/{simulate,what-if} → Java passthrough → Python mission_simulator/what_if (real physics propagation per phase, not label swapping)
```

Each Java service client (`PhysicsServiceClient`, `MLServiceClient`, `HealthServiceClient`, `DegradationServiceClient`, `MissionServiceClient`) throws its own `*ServiceUnavailableException` on upstream failure. Controllers are supposed to catch these and return structured `503`s — see §8 for where this breaks.

## 5. Implemented Features

Physics prediction, residual computation, offline fault-injected dataset generation (5 scenarios + combined), feature engineering (88 features incl. rolling stats), Isolation Forest anomaly detector, XGBoost multiclass fault classifier, SHAP explainability (gated on anomaly=true), 6-subsystem health index with sensor-vs-physical fault isolation, degradation trend estimation, RUL with uncertainty bounds and honest null/STABLE/INSUFFICIENT_HISTORY states, 6-phase mission simulation with real per-phase health/degradation propagation, what-if scenario comparison, mission risk scoring, offline mission-isolated replay script, WebSocket 1 Hz telemetry stream, CORS configured for a Vite dev server that doesn't exist yet.

## 6. Verified Features (this session, with evidence)

All of the following were confirmed by **running the actual services**, not by reading code alone:

- `GET /api/telemetry/current` → 200, plausible telemetry.
- `GET /api/twin/current` → 200, actual/expected/residual triad all populated and consistent (e.g. rpmResidual = actual − expected, confirmed numerically).
- `GET /api/diagnostics/current` → 200, full chain populated including live SHAP explanation slot and sensor isolation firing correctly (`diagnosticType: SENSOR_FAULT`, `affectedSensor: vibration` on a live run).
- `GET /api/health/current` → 200, `overallHealth: 91.76`, subsystem breakdown, sensor consistency scores all present.
- `GET /api/degradation/current` → 200, correctly `INSUFFICIENT_HISTORY` / low confidence with 1-3 samples.
- `GET /api/rul/current` → 200, `rulHours: null`, `status: STABLE` once no corroborated fault is active — matches Principle 5 (no fabricated certainty) exactly.
- `GET /api/mission/default-profile` → 200, real 6-phase MALE UAV profile (TAKEOFF/CLIMB/CRUISE/LOITER/DESCENT/LANDING).
- `POST /api/mission/simulate` → 200, real per-phase health propagation, `missionRiskScore`, `operatorRecommendation`.
- `POST /api/mission/what-if` → 200, baseline vs scenario comparison with real deltas.
- **503 propagation for physics-dependent endpoints** (`/api/twin/current`, `/api/diagnostics/current`, `/api/mission/*`): confirmed correct — killing the Python process produces structured `503` with `status: physics-unavailable` / `mission-unavailable`, not a raw crash.
- **503 propagation for health/degradation/rul is BROKEN** — see §8, now fixed.
- Python test suite: **56/56 PASS** (fresh venv, fresh `pip install -r requirements.txt`, freshly trained models).
- Java test suite: **21/21 PASS**, `BUILD SUCCESS`.
- Fresh dataset generation (`generate_dataset.py --scenario ALL --runs-per-scenario 5 --seed 42`) → 7500 rows / 25 missions, reproducible.
- Fresh ML training (`app.ml.training`) → artifacts produced, metrics captured (see §9).
- Zero-severity misfire produces **no** injected events (`fault_models.py` line 99: `if severity <= 0.0: return healthy`, before the RNG draw) — historical bug is fixed, and covered by an explicit regression test `test_zero_severity_misfire_has_no_injected_events`.
- Mission-history isolation in the **offline replay script** (`replay_rul.py`) — `reset_for(mission_id)` clears health/degradation history on mission-ID change, covered by `test_replay_resets_history_between_missions` and `test_replay_orders_rows_by_timestamp_without_merging_missions`.
- Sensor-vs-physical double-counting mitigation: `health_calculator._subsystem_scores` explicitly excludes the isolated faulty sensor's channel from the physical subsystem score (`thermal_names = [... if name != sensor_fault]`) — a deliberate, working fix for the exact concern raised in §23 of the brief.
- The historically-reported `prediction` vs `physicsPrediction` 422 contract mismatch: **confirmed fixed**, and fixed correctly (not papered over) — see §8/§19 for the mechanism.
- `httpx2` in `requirements.txt`: **confirmed NOT a bug** — this project's Python environment resolves `httpx2` (not `httpx`) as of 2026, and Starlette's `TestClient` in this environment explicitly requires and imports `httpx2 as httpx`. Installing the historically-"correct" `httpx` would have broken `TestClient`. This reverses a historical assumption baked into the audit brief — verified by reading the installed `starlette/testclient.py` source directly.

## 7. Partially Implemented Features

- **Java-side diagnostic history has no mission-boundary awareness.** `DiagnosticService` keeps a single `ArrayDeque<DiagnosticSnapshot>` (cap 60) with no `missionId` reset logic, unlike the offline `replay_rul.py` which explicitly isolates missions. Currently harmless because the live simulator runs one continuous mission (`MSN-A23`), but if the live sim is ever extended to start new missions mid-session, degradation/RUL history will leak across mission boundaries. **Not yet a bug, but a latent one.**
- **SHAP explainability is rarely observable in practice** — `explanation` is only computed `if is_anomaly`, and the anomaly detector's test-set recall is ~6.5%, so on real runs `explanation` is null the overwhelming majority of the time even during active faults. Code path is correct; end-to-end usefulness is bottlenecked by §9's anomaly recall issue.
- **Mission risk / what-if is implemented and verified working**, but has not been exercised against all four required fault scenarios (Injector/Lubrication/Misfire/SensorDrift) in this session — only NORMAL/default profile was live-tested for mission endpoints due to time budget. Python-level `test_mission.py` (10 tests, all passing) does cover fault-conditioned mission runs.

## 8. Known Bugs / Integration Failures

### BUG-1 (P0, FIXED THIS SESSION) — `/api/health/current`, `/api/degradation/current`, `/api/rul/current` return raw HTTP 500 instead of 503 when the physics service is down

**Root cause:** `DiagnosticService.getCurrentDiagnostics()` calls `twinService.getCurrentTwin()` first, which throws `PhysicsServiceClient.PhysicsServiceUnavailableException` when the Python service is unreachable. `HealthController`, `DegradationController`, and `RulController` only caught `HealthServiceUnavailableException` (and `DegradationServiceUnavailableException` for the latter two) — none of them caught `PhysicsServiceUnavailableException` or `MLServiceUnavailableException`, which are thrown *earlier* in the same call chain. The exception propagated uncaught to Spring's default handler, producing an unexplained `500 Internal Server Error`.

**Confirmed live:** killed the Python process, hit all six diagnostic endpoints. `/api/twin`, `/api/diagnostics`, `/api/mission/*` correctly returned `503`; `/api/health/current`, `/api/degradation/current`, `/api/rul/current` returned raw Spring `500` with no structured body.

**Fix applied:** added `catch (PhysicsServiceUnavailableException)` and `catch (MLServiceUnavailableException)` to `HealthController`, `DegradationController`, `RulController`, returning the same `503` shape already used elsewhere (`status: physics-unavailable` / `ml-unavailable`). See §19 Completed Work Log for the diff and re-verification.

### BUG-2 (P2, documented, not fixed) — Build artifacts committed to git

96 files under `backend/target/` (compiled `.class` files, both `classes/` and `test-classes/`) are tracked in git. There is no root `.gitignore` and no `backend/.gitignore`. This is why `git status` at session start showed ~70 modified files that were never meaningfully "changed" by a developer — they're just stale compiled output. Recommend adding a `.gitignore` (`target/`) and `git rm -r --cached backend/target` in a dedicated cleanup commit — **not done this session** because it rewrites a large chunk of tracked history/diff and should be a deliberate, reviewed action, not a side effect of an audit.

### BUG-3 (P3, found session 2, **FIXED overnight sprint, 2026-09-10**) — WebSocket telemetry stream serialized `Instant` fields inconsistently with the REST API

**Found while building the frontend's live-telemetry hook (session 2).** `TelemetryWebSocketHandler` constructed its own `ObjectMapper` (`new ObjectMapper()` + `registerModule(new JavaTimeModule())`) instead of using Spring Boot's autoconfigured, injectable `ObjectMapper` bean, so `timestamp` serialized as a raw epoch-seconds float over WS instead of ISO-8601 like every REST endpoint. Re-confirmed present with a fresh Node `ws` client at the start of the overnight sprint before touching anything: `"timestamp":1788990505.684044600` (`typeof number`).

**Impact was and remains none for the current frontend** — confirmed again via `grep -rn "\.timestamp\b" frontend/src/` → zero matches, so the fix could not regress anything already built.

**FIXED:** `TelemetryWebSocketHandler`'s constructor now takes `ObjectMapper` as a Spring-injected parameter (same pattern every REST controller and `MLServiceClient` already use) instead of constructing its own. **Verified live**, same Node `ws` client, post-fix: `"timestamp":"2026-09-09T21:49:46.737629300Z"` (`typeof string`), matching the REST contract exactly, across 4 consecutive frames. `mvnw test` 52/52 unaffected. See §15.11 for the full before/after evidence.

### BUG-4 (P1, found and FIXED overnight sprint, 2026-09-10) — Sensor-isolation gate falsely labeled real physical faults (Injector, Misfire) as `SENSOR_FAULT`

**Found live during the overnight sprint's fault-sequence validation (§15.11), not previously documented.** Activating `INJECTOR_DEGRADATION` (severity 0.9, past onset) produced `health.diagnosticType="SENSOR_FAULT"`, `affectedSensor="fuelFlow"` — even though the real trained classifier's own `faultProbabilities.INJECTOR_DEGRADATION=0.978`. `AlertBanner` would have shown *"Sensor fault isolated on fuelFlow — physical engine health unaffected"* for a confidently-identified physical fault. Reproduced identically for `MISFIRE` (`affectedSensor="vibration"`).

**Root cause:** `health_calculator.evaluate_health()`'s `model_supports_sensor_fault` gate read the anomaly-gated `predictedFault` field (`"NORMAL"` whenever the separate anomaly-score threshold hasn't crossed, per FINDING-5) instead of the classifier's own raw top-probability class — conflating "genuinely healthy" with "anomaly-gate-suppressed but the classifier knows exactly what fault this is."

**FIXED:** `model_supports_sensor_fault` now derives from `argmax(faultProbabilities)` (already computed, already sent every tick, not anomaly-gated) instead of `predictedFault`. Provably cannot change any health/degradation/RUL numeric score (`_subsystem_scores()` already receives `affected_sensor` independent of this label) and can only make the system more conservative (the `PHYSICAL_FAULT` branch still separately requires `anomaly=True`). Does not touch FINDING-3's actual root cause (the multi-channel `_sensor_health()` isolation heuristic) — confirmed live: Sensor Drift's diagnosticType is unchanged (still `NORMAL`, FINDING-3's gap reproduces exactly as before).

**Regression test:** `test_anomaly_gate_suppressed_physical_fault_is_not_misattributed_as_sensor_fault` (`tests/test_health.py`) — confirmed via `git stash` A/B to fail on the pre-fix code with the exact live symptom, pass post-fix. Full evidence, live re-verification across all 4 fault types, and files changed in §15.11.

### FINDING-1 (P2, found session 4, NOT fixed — root-cause of the low live anomaly recall) — `MLServiceClient` never sends diagnostic history to `/ml/analyze`

`MLAnalyzeRequest.history` (`physics-service/app/ml/inference.py`) defaults to `[]`; `MLServiceClient.analyze(TwinSnapshot)` (Java) never populates a history field at all. Every live `/ml/analyze` call computes the model's rolling-window features (rolling mean/std/slope, most of the 88 trained features) against an empty history — a fundamentally different, more degraded input regime than the properly-windowed offline evaluation in §9. **Confirmed live** (session 4, §15.3): 2 of 4 fault scenarios never triggered `anomaly=True` at all even at severity=0.9, well past onset. This is a more specific and more actionable explanation than "anomaly recall is ~6.5%" — it points at a concrete architectural gap, not just an under-tuned model. **Not fixed this session** — requires converting Java's `DiagnosticSnapshot` history into whatever row shape `build_live_features` expects, a nontrivial cross-cutting change. See §17 P1/P2.

### FINDING-2 (informational, found session 4, NOT a bug) — `expected_cht_c`/`expected_oil_temperature_c` take the actual observed value as an input, damping their residuals

`physics-service/app/physics/predictions.py`: `cht = expected_cht_c(telemetry.cht, telemetry.ambientTemperature, egt)` — unlike `expectedRpm`/`expectedEgt`/`expectedOilPressure`, which are derived purely from context (altitude/throttle/load/ambient/mission phase). This means any fault that perturbs CHT or oil temperature produces a structurally smaller residual for those two channels specifically than the raw fault-model magnitude would suggest — confirmed by direct comparison of raw `/simulation/inject-fault` output vs. served residuals for Sensor Drift (§15.3). This is an existing, validated physics-model property (a first-order thermal filter, consistent with Java's own `HealthyEngineSimulator.currentCht` filter design) — **not touched, not a bug**, documented so future residual-magnitude interpretation for CHT/oil-temperature accounts for it.

### FINDING-3 (P2, found session 4, NOT fixed) — Sensor-drift isolation did not trigger live in a 340s run, because the fault perturbs 4 channels at once and the isolation heuristic assumes a single anomalous sensor

`health_calculator._sensor_health()`'s isolation condition requires one channel's residual to be persistently large while *related* signals stay comparatively quiet (`magnitude≥0.12, persistence≥0.6, related_magnitude<0.08`). Sensor Drift perturbs cht/egt/oilPressure/rpm simultaneously, so no single channel's "related" signals stay quiet enough — confirmed live over ~340s (§15.3), where `diagnosticType` stayed `NORMAL` throughout rather than transitioning to `SENSOR_FAULT` as the §15.1 *offline* replay showed (that replay fed synthetic ground-truth classifier output directly, bypassing this interaction). The core safety property still held (`overallHealth` never dropped below 92 across the run — no fabricated catastrophic diagnosis), but the "eventually isolates as sensor" property did not reproduce live in the window tested. **Not fixed** — changing the isolation heuristic's multi-channel handling is an ML/health-calculator change, explicitly out of scope for this session.

### FINDING-4 (P1, found session 5, investigated session 6, **RESOLVED implementation session**) — Live telemetry and offline-trained telemetry come from two independently-implemented "healthy" engine models, causing the classifier to misjudge live samples it would judge correctly offline

Confirmed FINDING-1's history-wiring fix (§15.4) does **not**, by itself, resolve live misclassification for Injector Degradation. Direct controlled comparison: an offline-generated Injector Degradation sample is classified with 99.48% confidence by the exact same code path used live — and that confidence is unaffected by forcing `missionPhase="IDLE"` (live's permanent, never-changed value — no code path calls `SimulationState.setMissionPhase()`) or by forcing live's constant operating point (`altitude=0, throttle=0.8, load=0.7`) in place of training-typical values. Both ruled out as the cause. **Classification: physics/model limitation** (training/live-distribution mismatch).

**Session 6 (2026-09-09) fully quantified this finding — see §15.5 for the complete investigation.** Confirmed root cause: Python's offline generator (`app/simulation/mission_generator.py`) has no independent physics — it builds "healthy" telemetry by directly calling `predict_healthy_state()` (the same function `/physics/predict` exposes) and copying its output, so **offline healthy residuals are exactly zero by construction** (verified: `data/generated/healthy_missions.csv` residual columns are `mean=0, std=0, min=0, max=0` across every row). Java's `HealthyEngineSimulator` uses independent, structurally different formulas (missing Python's mission-phase RPM correction, missing Python's throttle/load EGT terms, different CHT/oil-temperature filter rates), so live healthy residuals are never zero. Hand-calculated predictions from the two formula sets matched fresh live captures almost exactly (rpm: predicted +100.0 vs observed +94.6 to +109.1; egt: predicted −49.8 vs observed −47.4 to −54.9). For Injector Degradation specifically, this baseline gap **flips the sign of the RPM residual** relative to what the classifier was trained on (offline: rpm≈−88.7; live: rpm≈+23.8, because the +100 baseline gap partially cancels the fault's own −72 effect) — the live vector is not "the trained signature plus noise," it is structurally a different vector. Explains why Misfire measurably improved after the history fix (its abrupt, large per-tick perturbations cross the threshold regardless of baseline shift) while Injector Degradation did not (its steadier, comparable-magnitude signature gets absorbed into or reversed by the baseline gap). **RESOLVED (implementation session, 2026-09-09):** Option B implemented — `HealthyEngineSimulator` now delegates to `PhysicsServiceClient.predict()` instead of independent formulas. Live-verified: 5 of 7 NORMAL residual channels are now exactly 0.0000 (mean/std/min/max), the remaining 2 converge monotonically toward 0; physics equivalence confirmed to 6 decimal places for context-driven channels. For Injector Degradation, the RPM residual sign is now correct (negative, matching training) and the real trained classifier's confidence jumped from ~5-22% to **97.79%** for `INJECTOR_DEGRADATION` (vs. offline's 99.48%) — Lubrication and Misfire similarly now hold 97-98% classifier confidence consistently. Full evidence, before/after tables, and the one remaining (separate, already-tracked) limitation in §15.6.

### FINDING-5 (P1, found session 8, root-caused session 8, PARTIALLY FIXED session 8) — Live anomaly-detector scores for Lubrication Degradation and Misfire run meaningfully higher than the offline-trained model predicts for the same fault/severity/onset parameters, while Injector Degradation and Sensor Drift do not

**Investigated as the dedicated P1 anomaly-threshold-gate session §17 called for — full investigation in §15.7, root cause in §15.8.** With FINDING-4 resolved, the anomaly-score gate (Isolation Forest, threshold 0.6124) was investigated end-to-end. **The offline model's separability is near-chance (AUC~0.59) and statistically uniform across all four fault types** — this rules out "the threshold is miscalibrated." **Live, the pattern is bimodal**: Lubrication Degradation and Misfire reliably cross the gate post-onset; Injector Degradation and Sensor Drift never do — confirmed not to be onset-transition noise by tracking each scenario for several minutes past onset, and confirmed via a matched-parameter offline-vs-live check (§15.7) that the live "success" for Lubrication is not reproduced by offline generation of the identical scenario.

**Root cause, identified with direct, controlled, feature-level evidence (§15.8): three compounding mechanisms, all upstream of the Isolation Forest, none of them "the threshold is wrong."**
1. **`DiagnosticService`'s history buffer is populated once per REST poll to `/api/diagnostics/current` (or the other 3 diagnostic-current endpoints), not on the existing 1Hz `SimulationService` scheduler.** The model's `temporal_window=5` rolling-window design and the offline generator's `sample_rate_hz=1.0` both assume 5 samples = 5 real seconds; live, 5 samples can span anywhere from ~5 seconds to minutes depending on client poll frequency. **Causally confirmed** via a controlled 1Hz-cadence re-test: Lubrication's steady post-onset score dropped from a persistent 0.637-0.648 (12-13s cadence) to 0.60-0.61 (1Hz cadence, right at the 0.6124 threshold) for the identical scenario — the single largest-effect contributor identified.
2. **Since FINDING-4's fix, live's context-driven telemetry channels (rpm/egt/fuelFlow/oilPressure) are deterministic functions of a permanently fixed operating point, producing exactly-zero rolling std/slope on every tick — while offline training data has real per-tick noise on these same channels (e.g. offline `rpm_rollingStd_5`≈28, live=0.0000, confirmed via direct feature-vector capture).** This is a side effect of FINDING-4's residual fix, not something FINDING-4 addressed, and it sharpens any fault-onset transient into a maximally discontinuous jump relative to what the offline-trained model expects.
3. **`missionPhase_IDLE` is `1` for 100% of live samples and `0` for 100% of training data** (`mission_generator.profile_for_seed()` never produces `IDLE`; live's `SimulationState` never changes it) — confirmed directly from source, a small constant contribution independent of fault state.

**Mechanism 1 (history-buffer cadence) FIXED and VERIFIED later this same session (§15.9): `DiagnosticService`'s history-buffer population was moved onto the existing 1Hz `SimulationService` scheduler instead of REST-poll timing.** Causally re-confirmed post-fix: slow (12-13s) and fast (1Hz) polling cadence now produce the *same* Lubrication result (~0.60-0.61 steady state), a complete reversal from the pre-fix divergence (0.637-0.648 slow vs. 0.60-0.61 fast). Poll-rate independence directly proven live: 97 REST polls across four different rates (including concurrent multi-client bursts) had zero effect on history growth, which stayed locked at 1.0000s mean interval. **Mechanisms 2 and 3 (zero live telemetry noise; permanent `missionPhase="IDLE"`) remain, explicitly not addressed by this fix, documented as separate P2 follow-ups.** FINDING-5 is therefore **partially, not fully, resolved** — see §15.9 for the complete before/after evidence, test results, and FINDING-5 status determination.

### Historically-reported issues that are NOT currently bugs (verified false-positive)

- `prediction` vs `physicsPrediction` 422 mismatch — fixed (§6, §19).
- `httpx2` vs `httpx` — not a bug in this environment (§6).
- Misfire baseline events at zero severity — fixed, regression-tested (§6), reconfirmed live session 4 (probabilistic per-tick pattern visibly alternated, no spurious events pre-onset).

## 9. ML / Physics Status

**Physics model** (`app/physics/`): reduced-order 0D causal chain — altitude+temp→air density, density+RPM→airflow, airflow+throttle→fuel flow and heat-release proxy, first-order filters for CHT/oil temp. Confirmed live that RPM/throttle/load/altitude/ambient temperature all influence `expectedRpm`/`expectedEgt`/etc. (different inputs produced different, physically-plausible expected values in manual testing). Explicitly and honestly framed in code/README as a prototype assumption, not a validated real-engine model — good practice, no correction needed. **This model is now, as of the FINDING-4 implementation session, the single source of truth for healthy engine physics everywhere in the system — the live simulator no longer has its own separate implementation (§15.6).**

**Anomaly detector threshold gate — investigated end-to-end session 8 (§15.7); no threshold change, root cause now understood in two parts.** With FINDING-4 resolved, the fault classifier's own confidence is confirmed correct and high (97-98%) for all 3 physical faults tested live. The Isolation Forest anomaly-score gate (threshold 0.6124) still only crosses intermittently live, which is what continues to suppress the correct classification from reaching `predictedFault` in the final API response most of the time. **Session 8's investigation found this is (1) an inherently weak, near-chance offline model (AUC~0.59, uniform across all 4 fault types — the threshold itself is a defensible, near-optimal operating point, not miscalibrated) compounded by (2) a newly-identified, separate live/offline feature-distribution gap (FINDING-5, §8) that makes 2 of 4 fault types (Lubrication, Misfire) cross reliably live despite offline evidence showing they shouldn't reliably cross at all.** Full evidence in §15.7.

**Anomaly detector** (Isolation Forest, threshold = 95th percentile of healthy **train-split** scores — the exported metadata previously mislabeled this "validation," corrected session 8, §15.7): freshly retrained session 1 on freshly generated data (7500 rows / 25 missions, seed 42), not retrained since.

```
Test set: precision 0.796, recall 0.065, f1 0.120
Validation set: precision 0.867, recall 0.071, f1 0.131
healthyFalsePositiveRate (test): 6.7%
detectionLeadTime: 4/4 missions eventually detected, mean lead time 217s, min 210s
Session 8 re-measurement: AUC-ROC validation 0.593, test 0.598 (near-chance); per-fault-type
                           sustained crossing rate at high severity (>=0.8) is 4.3-23.5%, all
                           statistically close to the ~4-6% healthy FPR — separability is weak
                           and uniform across fault types, not concentrated in specific ones
```

This **empirically reproduces** the historically-reported "~6.5% recall" finding — it is real, current, and confirmed, not stale. High precision + low recall means the detector is not noisy/false-alarming, it's under-triggering. **Root cause now diagnosed (session 8, §15.7, per Development Rule §43's dedicated one-change-at-a-time discipline): NOT a threshold-calibration or feature-scaling issue** (both hypotheses tested and refuted — see §15.7 Phase 3) — the model's own offline separability is inherently weak for every fault type, and a threshold-percentile sweep confirms no percentile choice would materially improve recall without an unacceptable false-positive cost. The live-observed intermittency has an additional, separate cause not present offline — see FINDING-5 (§8).

**Fault classifier** (XGBoost multiclass): macro F1 0.642, accuracy 0.627 on a fresh 5-class balanced test set (300/class). Per-class: INJECTOR_DEGRADATION precision 1.00/recall 0.60, MISFIRE precision 0.94/recall 0.57, SENSOR_DRIFT precision 0.70/recall 0.76, NORMAL precision 0.46/recall 0.60, LUBRICATION_DEGRADATION precision 0.43/recall 0.60. Confusion matrix shows most confusion is between NORMAL/LUBRICATION_DEGRADATION and physical faults being misread as NORMAL — expected for a fresh untuned baseline, not alarming for a prototype.

**Important:** these are freshly-trained-this-session numbers on freshly-generated-this-session synthetic data (seed 42, 5 runs/scenario, 300s). They are not necessarily identical to whatever numbers a previous developer report may have cited, but they are current, reproducible, and verified.

## 10. Backend Status

Spring Boot 3.3.0, Java 21 target, ran on installed JDK 24.0.2 without issue. No `application.properties`/`.yml` exists — all config is `@Value` defaults (`http://localhost:8000` for every service URL, implicit port 8080). This is fine for the prototype but means there is no environment-specific config story yet (dev/staging/prod URLs are all hardcoded defaults). 7 REST controllers + 1 WebSocket handler, all mapped correctly. 21/21 tests pass. Confirmed live startup and full endpoint sweep from repo root — did not test starting from `backend/` as cwd specifically, but `mvnw.cmd` handles this by convention and is very unlikely to differ.

## 11. Frontend Status

**IMPLEMENTED + VERIFIED (session 2, 2026-09-09).** Previously MISSING (see prior audit finding, preserved below for context). Built from scratch as a Vite + React 18 + TypeScript single-page app at `frontend/` — "AeroTwin-X Propulsion Health & Mission Reliability Console".

**What it does:** polls `GET /api/diagnostics/current` every 2s as the single consistent snapshot for health/physics/residuals/ML/degradation/RUL, and separately connects to `WS /ws/telemetry` for a live 1Hz telemetry readout with rolling sparklines and auto-reconnect. Panels: alert/recommendation banner, engine health (6-subsystem bars + trend), live telemetry (8 channels + sparklines + mission context), physics twin actual-vs-expected table + normalized-residual diverging bars, AI diagnosis (anomaly score, fault probability bars, SHAP top contributors when available), sensor-vs-physical fault isolation, degradation + RUL (with honest null/withheld states), and a mission section with a real "Run Mission Simulation" (seeded from the live current degradation/RUL, not a fresh-healthy assumption) and a "Run What-If" comparison with slider controls (cruise duration multiplier, load delta, throttle delta) showing baseline-vs-scenario deltas and the backend's own interpretation text.

**Verified, not assumed:**
- `npm install` clean, `npm run build` (`tsc && vite build`) — **PASS**, 0 TypeScript errors, 168KB JS / 10KB CSS gzip 52KB/2.4KB.
- `npm run dev` — Vite dev server serves the app on :5173.
- Live data flow confirmed with both backend services running: `GET /api/diagnostics/current` payload shape from a live `curl` matches the hand-written `DiagnosticSnapshot` TypeScript type field-for-field (checked side by side, not assumed from the Java source alone).
- CORS confirmed working from the real origin: `curl -H "Origin: http://localhost:5173"` against `GET /api/diagnostics/current` returns `Access-Control-Allow-Origin: http://localhost:5173` on both the preflight `OPTIONS` and the actual `GET`.
- WebSocket stream confirmed working with a real client (Node's native `WebSocket`, not a mock): connected to `ws://localhost:8080/ws/telemetry`, received 3 frames at the correct ~1Hz cadence. (This is also how BUG-3 was found — see §8.)
- 503/unavailable state confirmed end-to-end for the exact endpoint the frontend actually calls: killed the Python process, `GET /api/diagnostics/current` returned `503` with `{"status":"physics-unavailable","message":"...","telemetry":{...}}` — matches the `ServiceUnavailableBody` type the `AlertBanner`/`App` components branch on. `POST /api/mission/simulate` and `GET /api/mission/default-profile` both returned `503 {"status":"mission-unavailable", ...}` in the same state — matches `MissionSection`'s `ApiError` catch path.
- Recovery confirmed: restarted Python, `GET /api/diagnostics/current` returned `200` again within one poll cycle.
- Full `POST /api/mission/what-if` round-trip tested with the exact request shape `MissionSection` sends (`scenario: {cruiseDurationMultiplier, loadDelta, throttleDelta, selectedPhases}`) — real baseline vs. scenario numbers returned, matches the `WhatIfResult` type.
- No mock/dummy/hardcoded data anywhere in the frontend — `grep -rn "mock\|dummy\|Math.random\|setTimeout" frontend/src/` returns nothing; every rendered number comes from a live API response or is a client-side derived label (e.g. status-tier color mapping) of one.

**Not verified this session (explicitly, not silently):** no real browser was available in this environment (no browser-automation tool), so visual rendering/layout was not eyeball-checked — verification was via `tsc`/`vite build` succeeding, direct API-contract cross-checks, and a real (non-browser) WebSocket client. Fault-scenario UI behavior (Injector/Lubrication/Misfire/SensorDrift showing distinctly in the diagnosis panel) was not live-exercised this session — only NORMAL-condition live data was observed end-to-end through the UI's data layer.

**Historical note (session 1 finding, still true as history):** `git log` showed only 3 commits total (`0f90ae5`, `e7e3c56`, `904dabe`), none of which ever added a frontend; `CorsConfig.java`'s pre-existing comment referencing "the Vite dev server (localhost:5173)" was the only frontend-shaped evidence, i.e. the backend was built anticipating a frontend that had never actually been created in this repo. Session 2 used that CORS configuration as-is (confirmed working, see above) rather than modifying it.

## 12. Mission Simulation Status

IMPLEMENTED + VERIFIED, including fault-conditioning (session 3). `POST /api/mission/simulate` (Java passthrough → Python `mission_simulator.simulate_mission_trajectory`) produces a real per-phase trajectory: for the default 6-phase profile, health degrades monotonically and plausibly per phase (100.0 → 99.51 across TAKEOFF/CLIMB/CRUISE/LOITER/DESCENT/LANDING in a healthy baseline run), with `phaseRiskScore`, `riskBand`, `missionRiskScore`, `missionReliabilityScore`, `operatorRecommendation`, and `operatorRationale` all populated from real calculation, not hardcoded. `test_mission.py` has 10 passing tests covering fault-conditioned trajectories.

**Fault-type conditioning live-verified session 3** (§15.1): all 4 `faultType` values (`INJECTOR_DEGRADATION`, `LUBRICATION_DEGRADATION`, `MISFIRE`, `SENSOR_DRIFT`) produce distinct, correctly-attributed component-degradation signatures and mission-risk outcomes via live `curl` against the running Java+Python stack — physical faults isolate to their expected component (combustion / lubrication / combustion+mechanical respectively) and elevate mission risk (LOW→GUARDED/AT_RISK); sensor drift leaves physical health/risk unchanged and only elevates `sensorObservabilityRisk`, matching `test_sensor_drift_does_not_cause_catastrophic_physical_degradation`. This capability existed in the backend but had no frontend control until session 3 added a fault-condition selector to `MissionSection.tsx` (see §19).

## 13. Mission Replay Status

IMPLEMENTED + VERIFIED for the **offline** `scripts/replay_rul.py` path: mission-boundary history isolation via `reset_for(mission_id)`, chronological ordering without cross-mission merging, both explicitly regression-tested (`test_replay_rul.py`, 3/3 passing). **NOT implemented** for the live in-process Java diagnostic history (§7) — different code path, different guarantees.

## 14. Testing Status

```
Python (physics-service): 66/66 PASS  — pytest -q (64 pre-existing + 2 new for ML history integration)
Java (backend):           43/43 PASS  — mvnw test, BUILD SUCCESS (38 pre-existing + 5 new/changed for ML history)
Frontend:                 npm run build → PASS (tsc + vite build, 0 errors, no frontend files changed this session)
Live smoke test:          6/6 core GET endpoints 200 OK against live Java+Python
                           3/6 POST/GET mission endpoints tested live, all 200 OK
                           503 propagation: 3/6 endpoints correct pre-fix, 6/6 correct post-fix (session 1)
Frontend live wiring:     diagnostics/current, mission/default-profile, mission/simulate, mission/what-if,
                           and WS /ws/telemetry all confirmed reachable from the frontend's exact contract
                           and origin (session 2, see §11)
Live fault injection:     all 4 fault types + NORMAL run end-to-end against the live stack, real onset/ramp
                           timing observed (not mocked or shortcut) — full detail in §15.3 (session 4)
ML history direct contract: request-body instrumentation confirmed non-empty, growing, correctly-flattened
                           history reaching Python live; a real bug (missing runId per history row) was
                           found and fixed via this same live check, not just unit tests (§15.4, session 5)
Regression sweep (session 5): mission/simulate, mission/what-if, and WS /ws/telemetry all re-verified 200/OK
                           after the ML history fix — no regression to any previously-working path
Python (physics-service): 66/66 PASS — unchanged (no Python files touched in the FINDING-4 implementation)
Java (backend):           48/48 PASS — mvnw test, BUILD SUCCESS (43 pre-existing + 5 new/changed for FINDING-4)
Frontend:                 npm run build → PASS, 0 errors (no frontend files touched)
FINDING-4 healthy baseline: 20 live NORMAL samples — 5 of 7 residual channels exactly 0.0000
                           (mean/std/min/max), remaining 2 converging monotonically toward 0 (§15.6)
FINDING-4 physics equivalence: live Java telemetry vs. direct /physics/predict call, identical context
                           → exact match to 6 decimal places (rpm, egt) — not an approximation, the
                           same function call (§15.6)
FINDING-4 fault re-test:  Injector classifier confidence 97.79% for the correct class (was ~5-22%
                           pre-fix); Lubrication 98.0-98.1% (was threshold-borderline); Misfire
                           97.3-97.9% (was inconsistent); Sensor Drift isolation gap confirmed
                           unaffected, as expected (§15.6)
FINDING-4 fallback:       Python killed mid-session — /api/simulator/fault correctly reported
                           healthyBaselineFresh=false; /api/telemetry/current stayed available with
                           frozen values; /api/twin/current correctly still 503'd (unchanged, separate
                           dependency); recovery on Python restart confirmed automatic (§15.6)
Python (physics-service): 66/66 non-erroring PASS — pytest -q, 59 pre-existing + 7 new
                           (tests/test_anomaly_detector.py, session 8); 7 pre-existing errors
                           are an environment-only missing xgboost import, confirmed unrelated
                           to this session via git stash A/B (§15.7)
Java (backend):            not touched session 8 — 48/48 from session 7 stands, unchanged
Frontend:                  not touched session 8 — unchanged
Anomaly-gate investigation (session 8): offline AUC-ROC 0.593 (validation)/0.598 (test), near
                           chance; per-fault-type sustained crossing rate 4.3-23.5% at high
                           severity, statistically close to the ~4-6% healthy FPR for every
                           fault type — feature-scaling, severity-dilution, and feature-mode
                           hypotheses all tested and refuted (§15.7)
Anomaly-gate live evidence (session 8): 47 live samples across NORMAL + 4 faults, several
                           minutes each past onset — Lubrication (4/4) and Misfire (3/3) cross
                           reliably; Injector (0/15) and Sensor Drift (0/6) never cross; matched-
                           parameter offline regeneration of the Lubrication scenario does NOT
                           reproduce the live crossing (offline: 0.49-0.57; live: 0.637-0.648) —
                           new FINDING-5, a live/offline distribution gap separate from FINDING-4
                           (§8, §15.7)
FINDING-5 root cause (session 8, §15.8): 3 mechanisms identified via direct feature-level
                           capture — REST-poll-driven history sampling (largest effect,
                           causally confirmed via a 1Hz-cadence A/B test), zero live per-tick
                           telemetry noise (side effect of FINDING-4's fix), permanent
                           missionPhase="IDLE" (0% of training data)
FINDING-5 implementation (session 8, §15.9): DiagnosticService.tick()/getCurrentDiagnostics()
                           split — history now populated by the existing 1Hz scheduler, never
                           by REST reads. Java: mvnw test → 52/52 PASS, BUILD SUCCESS (45
                           pre-existing/session-7-baseline + 7 in the rewritten
                           DiagnosticServiceTest, 4 new). Python: pytest -q → 73/73 PASS,
                           unchanged. Frontend: npm run build → PASS, 0 errors, unchanged.
                           History cadence measured live: 101 samples/100.01s, mean interval
                           1.0001s (min 0.9519s, max 1.0510s) with zero REST polling; 97 REST
                           polls across 4 different rates (1Hz/5Hz/0.1Hz/concurrent) produced
                           zero additional history entries (mean interval stayed 1.0000s).
                           Lubrication slow-cadence (12-13s) and fast-cadence (1Hz) scores now
                           converge to the same ~0.60-0.61 result post-fix — pre-fix they
                           diverged by ~0.03-0.05 (0.637-0.648 vs. 0.60-0.61)
Overnight sprint (2026-09-10), via physics-service/.venv (corrected environment, §15.11):
Python (physics-service): pytest -q → 74/74 PASS, 1 harmless deprecation warning, ZERO
                           sklearn-version-mismatch warnings (73 pre-existing + 1 new
                           regression test for BUG-4)
Java (backend):            mvnw test → 52/52 PASS, BUILD SUCCESS, unchanged count from
                           session 8 (BUG-3/BUG-4 fixes did not add or remove any test)
Frontend:                  npm run build → PASS, 0 errors, unchanged
FINDING-5 secondary contributors, isolated ablation (§15.10): zero-noise effect -0.0035 to
                           +0.0094 (negligible); mission-phase-IDLE effect <=0.03 across all
                           7 phases, IDLE trends low not high (negligible) — both closed
                           decision C, no code changed
BUG-3 fix verified live:  real Node ws client, 4 frames, timestamp now ISO-8601 string
                           (was raw epoch float), matching REST exactly
BUG-4 fix verified live:  Injector diagnosticType NORMAL (was SENSOR_FAULT), classifier
                           confidence 0.978 untouched; Misfire 0/10 samples SENSOR_FAULT
                           (was misattributed); Lubrication/Sensor-Drift diagnosticType
                           unchanged (confirms FINDING-3 untouched); regression test
                           confirmed to fail pre-fix (git stash A/B) and pass post-fix
Full live fault sequence: NORMAL -> INJECTOR -> NORMAL -> LUBRICATION -> NORMAL -> MISFIRE
                           -> NORMAL -> SENSOR_DRIFT -> NORMAL run live end-to-end; all 4
                           NORMAL checkpoints show clean reset (residuals <=0.13 max-abs,
                           overallHealth=100.00, rul.status=INSUFFICIENT_HISTORY honestly,
                           no cross-scenario contamination)
Backend recovery:         fresh kill-python test post-DiagnosticService-rewrite — 503
                           propagation correct on all 3 downstream-dependent endpoints,
                           telemetry stays 200 (frozen), automatic recovery confirmed
```

Test quality note: the Python suite spans unit (physics equations, feature engineering), integration (FastAPI TestClient hitting real routers with real Pydantic validation), and dedicated regression tests for previously-known bugs (zero-severity misfire, mission replay isolation) plus the `/simulation/inject-fault` wrapper contract (session 4) and (session 5) a dedicated integration test using the real trained artifacts and real offline dataset generator to prove history measurably changes rolling-window features and anomaly scores, not just that the wire format is accepted. The Java suite is largely `@SpringBootTest`/`@WebMvcTest` controller/service tests with mocked collaborators per Spring convention, plus plain Mockito unit tests (`SimulationService`, `SimulationState`, and session 5's `DiagnosticServiceTest`) for state-machine and call-ordering behavior — including a direct `ArgumentCaptor`-based assertion that each tick's ML history contains exactly the prior ticks' samples and never the current one. Neither layer's automated suite by itself proves the live Java↔Python wire contract or real temporal behavior; both were separately verified by hand with both services actually running, and session 5 specifically used temporary request-body instrumentation (added and then fully removed, confirmed via `git diff`) to verify the direct contract before relying on behavioral inference (§6, §8, §15.1, §15.3, §15.4).

## 15. Validation Results

See §9 for full ML metrics. Summary: anomaly detector has high precision (0.80-0.87) but low recall (0.065-0.071) on synthetic held-out data — a real, reproducible weakness, not a demo blocker (mission-level detection lead time shows faults are eventually caught, just not on every sample). Fault classifier macro F1 0.64 is a reasonable untuned baseline. Health/degradation/RUL logic was validated by direct behavioral inspection (correct STABLE/INSUFFICIENT_HISTORY handling, no fabricated certainty) rather than a dedicated numeric ground-truth harness — no such harness exists in the repo yet.

### 15.1 Fault Scenario End-to-End Validation (session 3, 2026-09-09)

**Objective:** verify the frontend built in session 2 correctly represents the backend's already-implemented fault scenarios (Injector Degradation, Lubrication Degradation, Misfire, Sensor Drift), not just NORMAL.

**Critical architectural finding, established before any testing began (from reading `HealthyEngineSimulator.java`, `SimulationService.java`, and every controller — not assumed):**

**The live, continuously-running telemetry simulator that feeds `/api/diagnostics/current` (and therefore the frontend's Health, Live Telemetry, Physics Twin, AI Diagnosis, Sensor Isolation, and Degradation/RUL panels) has zero fault-injection capability and no live endpoint exists to configure one.** `HealthyEngineSimulator implements EngineSimulator` is a single deterministic healthy-engine model — no fault type field, no severity, no schedule, nothing to switch. `grep -rln "fault\|Fault\|scenario\|Scenario" backend/src/main/java` returns only mission-related files; nothing in the telemetry/simulator/twin path. Confirmed live: polled `/api/diagnostics/current` 5 times over 10 seconds — `diagnosticType` and `predictedFault` stayed `NORMAL`/`NORMAL` every time (see evidence below).

Fault injection exists in exactly two places in this codebase:
1. `physics-service/app/simulation/fault_models.py` + `dataset_generator.py` — **offline only**, driven by `scripts/generate_dataset.py`, writes CSVs. Not exposed by any FastAPI route. This is what session 1 used to retrain the ML models and what §9's metrics come from.
2. `physics-service/app/mission/mission_simulator.py`'s `fault_type` parameter — **live and reachable**, exposed via `POST /api/mission/simulate` and `POST /api/mission/what-if` (Java `MissionController` → `MissionServiceClient` → Python `/mission/simulate` / `/mission/what-if`). This is a self-contained forward degradation-trajectory model: it does **not** run telemetry/residuals/anomaly detection/classification/sensor isolation — it directly biases a component-degradation trajectory and rate multiplier based on `fault_type`, then computes health/degradation/mission-risk from that. It reuses `predict_healthy_state` only for stress-factor inputs (RPM/CHT), not for producing residuals.

**Consequence for validation:** the 10-stage chain the objective asks about (Fault Injection → Telemetry → Physics Expected State → Residual → Anomaly Detection → Fault Classification → Sensor-vs-Physical Isolation → Health → Degradation → RUL → Operator Dashboard) **cannot be exercised live, end-to-end, through the frontend for any of the 4 non-normal scenarios**, because the live telemetry source that everything upstream of Mission depends on cannot produce fault telemetry. This is a genuine, structural gap in what was built — not a frontend bug, not something to paper over, and **not something fixed this session**, per explicit instruction not to invent new APIs or modify the architecture to make testing easier.

What **could** be validated live, honestly, given that constraint:
- **The Mission Simulation/What-If slice of the chain** (`fault_type` → component-degradation bias → health/degradation trajectory → mission risk/reliability → operator recommendation) — live-reachable, and now frontend-reachable (a fault-condition selector was added to `MissionSection.tsx` this session — see below).
- **The full chain for all 4 scenarios, offline, via the backend's own real evaluation code** — not reachable by the frontend, but real evidence that the backend logic itself (not just the mission slice) is implemented correctly: (a) `data/models/evaluation_metrics.json` (session 1's fresh training run) for anomaly/classification per fault class, and (b) re-running `scripts/replay_rul.py` this session against the existing fault-injected CSVs, which calls the **actual** `evaluate_health()` (`health_calculator.py`) and `estimate_degradation()`/`estimate_rul()` (`degradation_estimator.py`) — the same functions the live `/health/evaluate` and `/degradation/evaluate` endpoints call — against real fault-injected telemetry residuals.

**Frontend change made to enable this validation** (justified as "necessary to make existing implemented behavior correctly flow through the system," not a new feature): `MissionSection.tsx` previously never sent a `faultType`, so there was no way to exercise the mission simulator's existing fault-conditioning capability through the UI at all. Added a fault-condition `<select>` (NORMAL / Injector Degradation / Lubrication Degradation / Misfire / Sensor Drift) to both the Mission Simulation panel (sets `MissionSimulationRequest.faultType` directly) and the What-If panel (sets `WhatIfScenario.faultTypeOverride`, deliberately leaving the top-level request `faultType` unset so baseline stays healthy and the delta isolates the fault's effect — this is how `evaluate_what_if` in `what_if.py` is designed to be used: `fault_input = scenario.faultTypeOverride or fault_type`). Also surfaced `finalComponentDegradation` (worst component) and `sensorObservabilityRisk` in both result displays, since those two fields are exactly what distinguishes a physical fault from sensor drift at the mission level. No backend files changed, no new endpoints, no new request fields — only existing, already-documented DTO fields (`faultType`, `faultTypeOverride`) that had no UI control before.

---

#### Scenario: NORMAL / Healthy

**Trigger:** none needed — default state of the live simulator.

**Backend Evidence:** `GET /api/diagnostics/current` (Java :8080, Python :8000, both live) →
```
health: 96.17 HEALTHY NORMAL
analysis: anomaly=False predictedFault=NORMAL
degradation: trend=INSUFFICIENT_HISTORY overallDegradation=0.0409
rul: status=INSUFFICIENT_HISTORY rulHours=None
```
5 consecutive polls over 10s all showed `diagnosticType=NORMAL`, `predictedFault=NORMAL`, health drifting narrowly (96.17→96.96) as expected from simulator noise.

**Frontend Evidence:** confirmed at the data-contract layer (no browser available — see §21). `useDiagnostics`'s polling hook receives exactly this shape every 2s; `HealthPanel`, `DiagnosisPanel`, `SensorIsolationPanel`, `DegradationRulPanel` all branch on the same fields exercised above and were verified against this live payload in session 2 (§11). `AlertBanner` renders the `NORMAL`-branch headline ("Engine nominal — overall health …").

**Expected Behavior:** high health, `NORMAL` diagnosis, no anomaly, RUL honestly withheld pending history.

**Actual Behavior:** matches exactly.

**Result: PASS**

**Evidence:** live `curl` output above (session 3); full panel-level data-contract verification in session 2 (§11, §19).

**Issues Found:** none.

---

#### Scenario: Injector Degradation

**Trigger:** `POST /api/mission/simulate` with `{"faultType":"INJECTOR_DEGRADATION"}` (via the new frontend fault-condition selector, "Run Mission Simulation" panel). **The live Telemetry/Twin/Diagnosis/Health/Sensor-Isolation/Degradation-RUL panels cannot be triggered into this state — see the architectural finding above.**

**Backend Evidence (live, mission chain):**
```
riskBand: GUARDED | recommendation: MISSION_CAUTION
missionRiskScore: 0.3947 | reliability: 0.6053
projectedEndHealth: 92.52 | minHealth: 92.52
finalComponentDegradation: {thermal: 0.0102, lubrication: 0.0176, combustion: 0.2624, mechanical: 0.013, electrical: 0.0025}
sensorObservabilityRisk: 0.0
```
vs. the healthy baseline (`riskBand=LOW`, `MISSION_GO`, `projectedEndHealth=99.51`, all components ≤0.007) — combustion is the clear, isolated outlier (0.2624 vs ≤0.018 everywhere else), exactly matching `mission_simulator.py`'s `INJECTOR_DEGRADATION` branch (`comp_deg["combustion"] = max(..., 0.25)`, `fault_multiplier = 2.5`). What-If comparison (baseline healthy, scenario carrying the fault) showed `Δrisk +0.30`, `Δhealth −7.91`, riskBand LOW→AT_RISK, interpretation text correctly naming the elevated risk.

**Backend Evidence (offline, full chain — not frontend-reachable):** `scripts/replay_rul.py` re-run this session against `data/generated/injector_degradation.csv` (session 1's fault-injected dataset), calling the real `evaluate_health`/`estimate_degradation`/`estimate_rul`. Run 0 trajectory: health 100.00 (t=60s, pre-onset) → 98.88 (t=130s, just after 120s onset) → 89.92 (t=180s) → 73.96 (t=250s) → 69.37 (t=295s). `diagnosticType` flips `NORMAL`→`PHYSICAL_FAULT` exactly at fault onset and stays there; `dominantMechanism=INJECTOR_DEGRADATION` throughout the fault period; `rulStatus=LOW_RUL` once material degradation is established (never fabricated STABLE). Aggregate: 600 physical-fault samples scored, `MAE=9.33h`, `RMSE=78.75h` against the synthetic ground-truth failure boundary. ML classifier evaluation (session 1, `data/models/evaluation_metrics.json`): `INJECTOR_DEGRADATION` precision 1.00 / recall 0.60 on held-out data.

**Frontend Evidence:** `MissionSection.tsx`'s new fault selector sends exactly the request shown above; `ResultSummary`/`PhaseTimeline` render `riskBand`, `operatorRecommendation`, `finalComponentDegradation`'s max, and `sensorObservabilityRisk` directly from this response — verified by matching the TS type (`MissionSimulationResult`) field-for-field against the live JSON keys used above (`finalComponentDegradation`, `sensorObservabilityRisk` both present and typed). The primary digital-twin panels (Health/Diagnosis/Sensor-Isolation/Degradation-RUL) show no change, correctly, because no live signal exists to change them (see architectural finding).

**Expected Behavior:** combustion-dominant degradation, elevated mission risk, `MISSION_CAUTION`/`AT_RISK`-class recommendation, physical (not sensor) fault attribution.

**Actual Behavior:** matches exactly for the mission chain. Primary panels stay NORMAL (expected given the architectural gap, not a defect in what was tested).

**Result: PARTIAL** — mission-simulation slice PASSES with real, correctly-differentiated live data; the primary digital-twin panel chain is BLOCKED (see below), backed by strong offline evidence that the underlying backend logic is itself correct.

**Issues Found:** none in what was testable. The scope gap (no live fault injection into the primary telemetry/health chain) is the same structural issue affecting all 4 scenarios — documented once here, not repeated as a "bug" per scenario.

---

#### Scenario: Lubrication Degradation

**Trigger:** `POST /api/mission/simulate` with `{"faultType":"LUBRICATION_DEGRADATION"}`; What-If with `scenario.faultTypeOverride="LUBRICATION_DEGRADATION"`.

**Backend Evidence (live, mission chain):**
```
riskBand: AT_RISK | recommendation: MISSION_AT_RISK
missionRiskScore: 0.4594 | reliability: 0.5406
projectedEndHealth: 91.03 | minHealth: 91.03
finalComponentDegradation: {thermal: 0.0123, lubrication: 0.3211, combustion: 0.0149, mechanical: 0.0156, electrical: 0.003}
sensorObservabilityRisk: 0.0
```
Lubrication is the isolated outlier (0.3211 vs ≤0.016 elsewhere) — matches the `LUBRICATION_DEGRADATION` branch (`comp_deg["lubrication"] = max(..., 0.30)`, `fault_multiplier = 3.0`, the highest multiplier of the three physical faults, consistent with it producing the highest single-fault risk score of the three: 0.4594 vs 0.3947 (injector) and 0.4063 (misfire)). What-If: `Δrisk +0.37` (largest of the three), `Δhealth −9.59`, riskBand LOW→AT_RISK.

**Backend Evidence (offline, full chain):** `replay_rul.py` on `lubrication_degradation.csv`: health 100.00 (t=60s) → 95.81 (t=130s) → 62.57 (t=180s) → 49.73 (t=250s, **crosses the EOL=50 threshold**) → 48.46 (t=295s) — the fastest, most severe of the three physical trajectories, consistent with `fault_multiplier=3.0` being the highest. `diagnosticType=PHYSICAL_FAULT` from onset, `dominantMechanism=LUBRICATION_DEGRADATION`, `rulStatus=LOW_RUL`. Aggregate: 600 samples, `MAE=2.99h`, `RMSE=26.09h` — the best RUL accuracy of the three physical faults. ML classifier: `LUBRICATION_DEGRADATION` precision 0.43 / recall 0.60 (the weakest precision of the four fault classes — confused with NORMAL per the session-1 confusion matrix).

**Frontend Evidence:** same verification method as Injector — field-for-field match against `MissionSimulationResult`.

**Expected Behavior:** lubrication-dominant degradation, highest risk of the three physical faults, correctly attributed as physical.

**Actual Behavior:** matches exactly for the mission chain.

**Result: PARTIAL** — same structural reasoning as Injector Degradation.

**Issues Found:** none new. Worth flagging (not a bug, a pre-existing ML weakness already documented in §9): the classifier's weakest per-class precision is exactly this fault, so if the live chain were ever wired up, `LUBRICATION_DEGRADATION` is the class most likely to be visibly misclassified as `NORMAL` in the Diagnosis panel.

---

#### Scenario: Misfire

**Trigger:** `POST /api/mission/simulate` with `{"faultType":"MISFIRE"}`; What-If with `scenario.faultTypeOverride="MISFIRE"`.

**Backend Evidence (live, mission chain):**
```
riskBand: AT_RISK | recommendation: MISSION_AT_RISK
missionRiskScore: 0.4063 | reliability: 0.5937
projectedEndHealth: 90.27 | minHealth: 90.27
finalComponentDegradation: {thermal: 0.0082, lubrication: 0.0141, combustion: 0.2099, mechanical: 0.2604, electrical: 0.002}
sensorObservabilityRisk: 0.0
```
Both combustion (0.2099) **and** mechanical (0.2604) are elevated together — the only fault type that biases two components — matching the `MISFIRE` branch (`comp_deg["mechanical"] = max(..., 0.25)`, `comp_deg["combustion"] = max(..., 0.20)`, `fault_multiplier = 2.0`). What-If: `Δrisk +0.31`, `Δhealth −9.98` (largest single-scenario health delta observed, though not by much).

**Backend Evidence (offline, full chain):** `replay_rul.py` on `misfire.csv`: health 100.00 (t=60s) → 98.15 (t=130s) → 91.60 (t=180s) → 83.13 (t=250s) → 80.57 (t=295s) — the **least** severe end-state of the three physical faults by 295s (consistent with misfire being a probabilistic per-tick event rather than a continuous ramp — `Misfire.apply()` only fires with `event_probability = min(0.9, 0.75*severity)` per tick, so its average effect is diluted vs. a continuous degradation). `diagnosticType=PHYSICAL_FAULT`, `dominantMechanism=MISFIRE`, `rulStatus=LOW_RUL`. Aggregate: 565 samples (fewer than the other two — consistent with the probabilistic event model), `MAE=0.35h`, `RMSE=1.55h` — by far the tightest RUL accuracy of the three, because misfire's rapid, well-defined failure signature is easier to extrapolate. Also confirmed (session 1, source-level) that `Misfire.apply()` returns `healthy` unchanged when `severity <= 0.0`, before any RNG draw — the historically-reported "misfire fires even at zero severity" bug is fixed and regression-tested (`test_zero_severity_misfire_has_no_injected_events`). ML classifier: `MISFIRE` precision 0.94 / recall 0.57.

**Frontend Evidence:** same verification method as above.

**Expected Behavior:** combined mechanical+combustion signature distinct from the single-component signatures of Injector/Lubrication; no fault effects before the 120s onset.

**Actual Behavior:** matches exactly for the mission chain; zero-severity/pre-onset behavior confirmed correct at the source level (unchanged from session 1's finding, re-cited here since it's directly relevant to this scenario's acceptance criteria).

**Result: PARTIAL** — same structural reasoning as the other two physical faults.

**Issues Found:** none.

---

#### Scenario: Sensor Drift

**Trigger:** `POST /api/mission/simulate` with `{"faultType":"SENSOR_DRIFT"}`; What-If with `scenario.faultTypeOverride="SENSOR_DRIFT"`. **This is the scenario where sensor-vs-physical isolation matters most, and it was not assumed — it was checked against real output.**

**Backend Evidence (live, mission chain) — the key result:**
```
riskBand: LOW | recommendation: MISSION_GO          (IDENTICAL to the healthy baseline)
missionRiskScore: 0.1102 | reliability: 0.8898        (IDENTICAL to healthy baseline)
projectedEndHealth: 99.51 | minHealth: 99.51           (IDENTICAL to healthy baseline)
finalComponentDegradation: {thermal: 0.0041, lubrication: 0.007, combustion: 0.005, mechanical: 0.0052, electrical: 0.001}  (IDENTICAL to healthy baseline)
sensorObservabilityRisk: 0.4                            (elevated — the ONLY field that changed)
```
This is exactly the intended behavior per `mission_simulator.py`'s `SENSOR_DRIFT` branch (`sensor_deg = max(sensor_deg, 0.40)` — no `comp_deg` mutation at all, unlike every physical fault branch) and matches the existing unit test `test_sensor_drift_does_not_cause_catastrophic_physical_degradation` (`projectedEndHealth > 85.0`, `sensorObservabilityRisk > 0.30`, `riskBand in ["LOW","GUARDED"]` — live result of 99.51/0.40/LOW satisfies all three with margin). What-If (baseline healthy vs. scenario with sensor drift): `Δrisk +0.0097` (essentially zero, vs. +0.30 to +0.37 for the three physical faults), `Δhealth −0.37` (vs. −7.9 to −10.0 for physical faults), interpretation correctly says "minimal risk delta… maintaining LOW status."

**Backend Evidence (offline, full chain) — the nuanced part:** `replay_rul.py` on `sensor_drift.csv` tells a more detailed story than the mission-level result alone. Health does decline over the ramp (100.00 → 99.63 → 96.43 → 82.23 → 74.91 at t=60/130/180/250/295s) — **and `diagnosticType` is `PHYSICAL_FAULT`, not `SENSOR_FAULT`, at t=130s and t=180s**, only flipping to `SENSOR_FAULT` (`affectedSensor=cht`) at t=250s once the isolation logic's persistence/confidence threshold (`isolation_confidence >= 0.6` in `health_calculator._sensor_health`) has had enough samples to build confidence. This is a real, defensible design property — the system does not prematurely dismiss a persistent deviation as "just a sensor" before it has enough evidence, which is the conservative/safe failure mode — but it means there is a genuine **isolation-latency window** (roughly 120s–250s into this fault's ramp) where the *health-calculator path* would show a real, non-zero health dip attributed to `PHYSICAL_FAULT` before correctly reclassifying. Aggregate over the full replay: `sensorFaultRulStatusCounts = {UNRELIABLE: 900, STABLE: 580, INSUFFICIENT_HISTORY: 20}` — **zero** `LOW_RUL` or catastrophic statuses across all 1500 sensor-drift samples, confirming RUL is never fabricated from a sensor issue, exactly as the README claims. ML classifier: `SENSOR_DRIFT` precision 0.70 / recall 0.76 (its strongest recall of the four fault classes).

**Frontend Evidence:** `MissionSection.tsx`'s `ResultSummary` now surfaces both `finalComponentDegradation` (max) and `sensorObservabilityRisk` side by side specifically so this distinction is visible — for this scenario a viewer would see component degradation at baseline-healthy levels next to a clearly elevated sensor-observability figure, which is the correct operator-facing signal ("this is an instrumentation issue, not engine damage"). `SensorIsolationPanel` (driven by the live diagnostics chain, not mission) has the matching UI language for when/if it ever sees a live `SENSOR_FAULT` diagnosis, but cannot be exercised today for the reason stated in the architectural finding.

**Expected Behavior:** physical health/mission-risk essentially unaffected; sensor-observability risk clearly elevated; no catastrophic RUL; isolation eventually attributes the issue to the sensor, not the engine.

**Actual Behavior:** matches exactly at the mission level (live). At the finer-grained health-calculator level (offline replay), isolation is correct **but not instantaneous** — there is a real, evidence-based isolation-latency window before `SENSOR_FAULT` is confidently declared. **Do not claim instantaneous sensor isolation without this caveat.**

**Result: PARTIAL** — mission-level sensor-vs-physical distinction PASSES cleanly and is now frontend-visible; the finer-grained isolation-latency behavior is a real, verified nuance (not a bug) that the live/frontend chain cannot currently demonstrate because that chain is unreachable (architectural finding above).

**Issues Found:** none that are bugs. One nuance worth a future session's attention (not fixed here, not in scope): the isolation-latency window means a `SensorIsolationPanel` viewer would briefly see the wrong diagnosis type during a real sensor-drift onset, if the live chain were ever wired up. This is a property of the persistence-window design, not an error — flagged for awareness, not fixed.

---

### 15.2 Summary Table

| Scenario | Mission-chain (live, frontend-reachable) | Primary digital-twin chain (Telemetry→...→RUL) | Overall Result |
|---|---|---|---|
| NORMAL | N/A (baseline) | PASS — live, full panel chain verified | **PASS** |
| Injector Degradation | PASS — combustion-isolated, correctly differentiated | BLOCKED (no live injection path); offline backend evidence strong | **PARTIAL** |
| Lubrication Degradation | PASS — lubrication-isolated, highest risk of the three | BLOCKED; offline backend evidence strong | **PARTIAL** |
| Misfire | PASS — combined mechanical+combustion, tightest RUL accuracy | BLOCKED; offline backend evidence strong, zero-severity fix reconfirmed | **PARTIAL** |
| Sensor Drift | PASS — physical health/risk untouched, sensor risk isolated | BLOCKED; offline evidence shows correct-but-delayed isolation | **PARTIAL** |

**No scenario is a FAIL.** Every backend behavior checked, live or offline, matched its documented/tested intent. The PARTIAL verdicts on the four fault scenarios reflect a real, structural, pre-existing scope boundary (no live fault-injection path into the primary telemetry/diagnostics chain) — not a defect discovered in the frontend or in newly-written code this session.

### 15.3 Live Fault Injection Into the Primary Diagnostics Chain (session 4, 2026-09-09)

This closes the exact gap §15.1/§15.2 identified: the primary dashboard (Telemetry/Twin/Diagnosis/Health/Sensor-Isolation/Degradation-RUL) can now show a real fault propagating live, not just Mission's hypothetical what-if.

#### Architecture decision

**Chosen mechanism:** Python owns all fault math (unchanged); Java owns simulator control state and orchestration only. Concretely: `HealthyEngineSimulator` still generates a healthy tick exactly as before (byte-for-byte unchanged — see "NORMAL preserved" below); when a fault is active, that healthy tick is POSTed to a **new** physics-service endpoint, `POST /simulation/inject-fault`, which is a thin wrapper that calls the **existing, unmodified** `FAULT_MODELS`/`FaultSchedule` from `app/simulation/fault_models.py` — the exact same objects `scripts/generate_dataset.py` already uses for offline generation. Zero fault semantics were reimplemented; the wrapper only computes `schedule.severity_at(elapsed)` and calls `fault_model.apply(...)`, then returns the perturbed telemetry.

**Why this and not a Java-side reimplementation:** every other domain algorithm in this system (physics, ML, health, degradation, mission) already lives exclusively in the Python service, with Java as a thin HTTP orchestrator — see §4's architecture diagram and every existing `*ServiceClient`. Reimplementing fault math in Java would have been the one exception to that pattern, and would have created two independently-maintained copies of the same fault semantics that could silently drift apart. Routing through Python instead means the live simulator, the offline dataset generator, and any future consumer all share one source of truth.

**Why not just expose the fault selector as a bigger change:** the smallest change that makes the existing pipeline reachable is exactly one new read of "is a fault active, and since when" (state Java already effectively owns, in `SimulationState`) plus one new HTTP call per tick when a fault is active (skipped entirely for NORMAL). No mission/physics/ML/health/degradation code needed to change to make this work — those all already treat "telemetry" as an opaque input and don't care whether it came from `HealthyEngineSimulator` alone or via the fault-injection detour.

#### API

**`GET /api/simulator/fault`** — returns the current live simulator fault state. No parameters.

**`POST /api/simulator/fault`** — body `{"faultType": "NORMAL" | "INJECTOR_DEGRADATION" | "LUBRICATION_DEGRADATION" | "MISFIRE" | "SENSOR_DRIFT", "severity": number | null}`. `faultType: "NORMAL"` (or an omitted/null `faultType`) resets to healthy. `severity` is an optional fixed override in `[0,1]`; when omitted, the fault ramps in using the same schedule as offline dataset generation (120s onset grace period, then a 120s linear ramp to full severity, then a hold). **The onset grace period always applies, even with a fixed severity override** — a severity override replaces the ramp *shape* once onset is reached, not the onset delay itself (this is existing `FaultSchedule` behavior, confirmed by a dedicated test, not something session 4 changed).

Both return the same shape:
```json
{"faultType": "INJECTOR_DEGRADATION", "severityOverride": 0.9, "elapsedFaultSeconds": 122.0, "active": true}
```
`elapsedFaultSeconds` is seconds since *this* activation (resets to 0 every time a fault is (re)activated) — anchored the same way the offline generator anchors a fresh dataset run to its own t=0, not to how long the mission has been running. `active` here means "a fault is currently configured" (`faultType != NORMAL`) — note this is a different meaning from the Python endpoint's own `active` field, which means "severity > 0 right now" (i.e. past the onset gate); both are documented, intentionally distinct, and used at different layers.

Validation: an unsupported `faultType` string is rejected with `400 Bad Request` by Spring's own enum deserialization (Java) / Pydantic's enum validation (Python `422`) — no custom validator code needed since the type systems already enforce the canonical 5-value taxonomy end-to-end.

Activating a fault or resetting to healthy also clears `DiagnosticService`'s rolling history (`resetHistory()`, new), so health/degradation/RUL trend calculations reflect only the current fault state, not a blend of before/after samples — necessary for "reproducible enough to validate" (requirement #5), not a change to mission-isolation architecture (which remains the separate, still-open item in §17 P2).

**New Python contract** (`physics-service/api/routes/simulation.py`): `POST /simulation/inject-fault`, body `{telemetry, faultType, elapsedFaultSeconds, severity?, seed}` (all fields already existed in `TelemetryInput`/`FaultType`/`FaultSchedule`; `seed` is new, see RNG note below), response `{telemetry, faultType, severity, active}`.

#### Simulator behavior

`SimulationState` gained: `activeFaultType` (default `NORMAL`), `faultSeverityOverride` (nullable), `faultActivatedAtSeconds`. `SimulationService.tick()`: generates the healthy tick exactly as before; if a fault is active, POSTs it to `/simulation/inject-fault` and uses the *response* telemetry as the tick's result; **on any failure of that call, falls back to the healthy tick for that one tick** rather than throwing. This fallback is not cosmetic: `tick()` runs inside a `ScheduledExecutorService.scheduleAtFixedRate` (the WebSocket handler's 1Hz loop) — per that API's own contract, an uncaught exception from a scheduled task **silently cancels all future executions**, which would have permanently killed the live telemetry stream (REST *and* WebSocket, since both read the same cached `latestTelemetry`) the first time the physics service hiccuped during an active fault. This was caught and tested (`SimulationServiceTest.faultInjectionFailureFallsBackToHealthyTelemetryInsteadOfThrowing`), not discovered live.

**NORMAL is preserved exactly.** When `activeFaultType == NORMAL`, `tick()` never calls the fault-injection client at all (`verifyNoInteractions` in `SimulationServiceTest`) — the healthy tick from `HealthyEngineSimulator` is used completely unmodified, identical to every prior session's behavior.

**RNG determinism for Misfire:** Misfire is the one fault model that draws a random number per tick (`rng.random() < event_probability`). Because `/simulation/inject-fault` is a stateless HTTP endpoint, a single `random.Random(seed)` object can't persist state across ticks the way the offline batch generator's one long-lived `Random` object does across an entire run. Instead each request derives `random.Random(seed + int(round(elapsedFaultSeconds)))` — reproducible if replayed with the same elapsed time, and varying tick-to-tick during a live run (confirmed live: telemetry alternated visibly between "misfire event" and "no event" ticks — see below). This is a documented, necessary adaptation for statelessness, not a change to the misfire probability model itself (`event_probability = min(0.9, 0.75*severity)` is untouched).

#### Fault semantics (mapped to the existing, unmodified fault models)

| Fault | Channels affected (`fault_models.py`, unchanged) | Onset | Notes |
|---|---|---|---|
| Injector Degradation | `fuelFlow` ×(1+0.25·sev), `egt` +90·sev+harmonic, `cht` +24·sev, `rpm` −80·sev+harmonic | 120s | Continuous once onset passes |
| Lubrication Degradation | `oilPressure` ×(1−0.45·sev), `oilTemperature` +35·sev, `cht` +18·sev, `egt` +20·sev, `rpm` −50·sev+ripple, `vibration` +2.5·sev, `fuelFlow` ×(1+0.08·sev) | 120s | Continuous, largest single-channel signature (oilPressure) |
| Misfire | Per-tick probabilistic event (`p = min(0.9, 0.75·sev)`); when it fires: `rpm` −(80+220·sev), `egt` −(20+100·sev), `cht` −(0.12×that), `vibration` +(1+4·sev), `fuelFlow` ×(1+0.12·sev) | 120s | Intermittent — alternates between event/no-event ticks, confirmed live |
| Sensor Drift | `cht` +0.12·sev·t, `egt` +0.20·sev·t, `oilPressure` +0.08·sev·t, `rpm` +0.35·sev·t, where **t = elapsed seconds since activation** (unbounded growth the longer it's left active — by design, matches the offline model exactly) | 120s | Does **not** touch `fuelFlow`/`vibration`; the only fault type intended to leave physical health/mission-risk essentially untouched (§15.1) |

#### End-to-end live verification (real command output, not source inspection)

All five scenarios run against the actual live stack (Java :8080, Python :8000), using `severity: 0.9` fixed overrides to make onset the only wait (~120s) rather than onset+ramp (~240s), except where noted. Each fault was activated via `POST /api/simulator/fault`, polled via `GET /api/telemetry/current`, `GET /api/twin/current`, and `GET /api/diagnostics/current` at intervals (each diagnostics poll also advances `DiagnosticService`'s history by one sample), then reset via `POST /api/simulator/fault {"faultType":"NORMAL"}`.

**NORMAL** — `GET /api/simulator/fault` on fresh boot: `{"faultType":"NORMAL","severityOverride":null,"elapsedFaultSeconds":7.0,"active":false}`, confirming the simulator defaults to healthy with no action needed. Diagnostics stabilized to `health≈94, status=HEALTHY, diagnosticType=NORMAL` after a few samples (one early single-sample noise blip briefly showed `SENSOR_FAULT`, self-corrected — pre-existing noise-driven behavior, not new). **Result: PASS.**

**Injector Degradation** — activated, telemetry unchanged pre-onset (confirmed at t=0), then at t≥120s: `rpm=4573.8→` (down from ~4655), `egt=985.4` (up from ~909), `fuelFlow=35.50` (up from ~29.0). Residuals: `fuelFlowResidual=7.87`, `egtResidual=23.1`, both clearly positive as expected. **Diagnosis did not match expectation**: `analysis.anomaly` stayed `False` and `health.diagnosticType` settled on `SENSOR_FAULT`/`affectedSensor=fuelFlow` (confidence 0.93), not `PHYSICAL_FAULT`/`INJECTOR_DEGRADATION`. Root cause investigated and confirmed, not guessed — see "New finding" below. Health/degradation still responded quantitatively in the right direction (`combustion` subsystem dropped to ~63, `degradation.trend=DEGRADING`→`ACCELERATING`) despite the wrong top-level label. Mission-chain behavior for this fault was already verified in §15.1 and is unaffected by this live-path finding (mission simulation doesn't call the live diagnostics chain at all). **Result: PARTIAL** — telemetry/physics/residual stages PASS; diagnosis stage FAILs its acceptance criterion (wrong fault type, wrong physical/sensor attribution); health/degradation quantitatively track the fault despite the wrong label.

**Lubrication Degradation** — activated, at t≥120s: `oilPressure` dropped from ~430 to 234 (`oilPressureResidual=-95.7`), `vibration` up (`+1.84` residual), matching the model exactly. Diagnosis: **mostly correct** — 6 of 8 consecutive polls showed `anomaly=True, predictedFault=LUBRICATION_DEGRADATION, diagnosticType=PHYSICAL_FAULT, dominantMechanism=LUBRICATION_DEGRADATION, trend=DEGRADING`; 2 of 8 polls flickered to `SENSOR_FAULT`/`fuelFlow`/`anomaly=False` before flipping back. Health dropped to 74.5 (CAUTION), `lubrication` subsystem to 48.5 (DEGRADED). RUL stayed `UNRELIABLE` with an honest, specific explanation ("Physical degradation is present, but its recent noisy trajectory does not support a reliable RUL rate") — correct, no fabrication. **Result: PASS**, with a noted intermittent-detection flicker (consistent with a classifier score hovering near threshold, not a hard failure).

**Misfire** — telemetry sampled at 1s intervals visibly alternated between "event" ticks (`rpm≈4363, egt≈800, vibration≈13`) and "no-event" ticks (`rpm≈4652, egt≈912, vibration≈8`), directly confirming the probabilistic per-tick model is live and working exactly as designed. Diagnosis: same pattern as Injector — `anomaly=False` throughout 8 polls, settled on `SENSOR_FAULT`/`SENSOR_QUALITY_ISSUE` rather than `PHYSICAL_FAULT`/`MISFIRE`. Health still declined (92.79→80.72) and `mechanical` component degradation tracked upward (to ~0.11, the largest component, correctly matching misfire's mechanical+combustion signature) despite the wrong label. RUL correctly stayed `UNRELIABLE`, no fabrication. **Result: PARTIAL** — same shape as Injector Degradation.

**Sensor Drift** — the most important scenario for isolation, and the one with the most nuanced result. At t=240s and t=310s, direct calls to `/simulation/inject-fault` confirmed the fault model itself produces substantial, correct drift (e.g. at t=240s: `cht +25.9`, `egt +43.2`, `oilPressure +17.3`, `rpm +75.6` — verified by calling the endpoint directly with known inputs). But the live `/api/twin/current` residuals at the same elapsed times were much smaller than that raw drift magnitude for **CHT specifically** (residual only ~2, not ~26–43). Investigated and confirmed the reason (see "New finding" below) — this is a real, physics-model-level property, not a fault-injection bug. RPM and oilPressure residuals stayed clearly visible throughout (`rpmResidual` 183–206, `oilPressureResidual` 24–29). Diagnosis over ~340s of continuous drift: `anomaly` stayed `False` and `diagnosticType` stayed `NORMAL` the entire time — **it never transitioned to `SENSOR_FAULT`**, unlike the offline replay in §15.1 which did transition (at ~130s post-onset, with ML-classifier ground truth fed in directly rather than the real, currently-underperforming live classifier). Investigated why — see below. Crucially, the core safety property still held: **`overallHealth` never dropped below 92 (stayed in the HEALTHY band) across the full ~340s run** — the system did not fabricate a catastrophic physical-fault diagnosis even though it also didn't correctly label the fault as sensor-related. **Result: PARTIAL** — the "no catastrophic physical fault" safety property PASSES; the "eventually isolates as SENSOR_FAULT" property, which the offline replay demonstrated, did **not** reproduce live in the ~340s window observed.

#### New findings from this session's live testing (not present in §15.1, because §15.1 could not reach this code path at all)

1. **`MLServiceClient.analyze()` never sends diagnostic history to `/ml/analyze`.** `MLAnalyzeRequest.history` defaults to `[]` (`physics-service/app/ml/inference.py`), and Java's `MLServiceClient.analyze(TwinSnapshot)` only ever sends `telemetry`/`prediction`/`residuals` — confirmed by reading both sides, not assumed. Every live `/ml/analyze` call therefore computes the model's ~88 rolling-window features (rolling mean/std/slope over a 5-sample window — most of what the model was trained on) against an **empty** history, a fundamentally different and more degraded input regime than the offline evaluation in §9/session 1, which used properly-windowed batch data. **This is the most likely root cause of why the anomaly detector essentially never fired live** (2 of 4 fault scenarios never triggered `anomaly=True` at all; a 3rd flickered). This is a distinct, more specific, and more actionable finding than "anomaly recall is ~6.5%" (§9) — it suggests the live number may be substantially worse than the already-low offline number, for an architectural reason (missing history), not a purely statistical one (model capacity). **Classification: architecture limitation.** Not fixed this session — wiring real history into `MLServiceClient` is a non-trivial change (needs to convert `DiagnosticSnapshot` history into whatever row shape `build_live_features` expects) and is exactly the kind of "second major architectural task" the brief said to document rather than fold into this one. **New top candidate for the P2 anomaly-recall investigation item in §17.**

2. **`expected_cht_c` and `expected_oil_temperature_c` take the actual/observed value as an input**, not just context (`physics-service/app/physics/predictions.py`: `cht = expected_cht_c(telemetry.cht, telemetry.ambientTemperature, egt)`; similarly for oil temperature). Every other expected channel (`expectedRpm`, `expectedEgt`, `expectedOilPressure`) is derived purely from context (altitude/throttle/load/ambientTemperature/mission phase), independent of the actual observed value. This means CHT and oil-temperature residuals are structurally damped relative to RPM/EGT/oil-pressure/fuel-flow residuals for **any** fault that perturbs those two channels — confirmed by direct comparison of raw fault-model output vs. served residuals for Sensor Drift, and consistent with the smaller-than-expected CHT residuals observed across Injector and Lubrication too. This is an existing, validated physics-model property (almost certainly an intentional first-order thermal filter design, mirroring the same pattern Java's own `HealthyEngineSimulator.currentCht` filter uses) — **not a bug, not touched this session**, per the explicit instruction not to change validated physics behavior. Documented here because it materially affects how residual magnitudes should be interpreted for CHT/oil-temperature specifically, across every fault scenario, live or offline.

3. **Finding 1 directly explains the Sensor Drift isolation gap.** `health_calculator`'s isolation logic gates partly on `model_supports_sensor_fault = model_fault in {"NORMAL","SENSOR_DRIFT"}` — since the live classifier's `predictedFault` defaults to `"NORMAL"` whenever `anomaly=False` (which, per Finding 1, is nearly always live), the ML gate itself isn't the blocker for Sensor Drift specifically (`NORMAL` is in the allowed set). The blocker is that isolation additionally requires a single channel's residual to be isolated with `magnitude≥0.12, persistence≥0.6, related_magnitude<0.08` — and Sensor Drift perturbs **four** channels (cht, egt, oilPressure, rpm) simultaneously, so no single channel's "related" signals stay quiet enough to cross that threshold within the ~340s window tested. **Classification: existing model limitation**, specifically an interaction between a fault model that perturbs multiple channels at once and an isolation heuristic designed around a single-sensor-anomaly assumption. Not present in the §15.1 offline finding, which used synthetic ground-truth-fed classifier output that bypassed this interaction entirely. **Not fixed this session** — changing the isolation heuristic's multi-channel handling is itself a nontrivial ML/health-calculator change, explicitly out of scope ("do not touch unrelated ML algorithms," "do not fix sensor-drift isolation by forcing immediate classification").

None of these three findings were fabricated, guessed, or left unverified — each is backed by either a direct source-code read (Findings 1–2) or a direct, reproducible live/API comparison (Finding 3, and the residual-magnitude comparison for Finding 2).

### 15.4 Diagnostic History Wired Into `/ml/analyze` (session 5, 2026-09-09)

Fixes the exact integration gap FINDING-1 (§8) identified: the live `MLServiceClient` never sent the rolling diagnostic history `DiagnosticService` already maintains, so every live `/ml/analyze` call computed rolling-window features against an empty window.

#### Root cause (confirmed from source, both sides)

- **What `/ml/analyze` expects:** `MLAnalyzeRequest.history: list[dict[str, Any]] = Field(default_factory=list)` (`app/ml/inference.py`) — a list of **flat** feature-row dicts (same shape as the current sample's internally-flattened `combined = {**telemetry, **prediction, **residuals}`), consumed by `build_live_features()`: `pd.DataFrame([*history, sample])`, sorted by `(missionId, timestamp)`, rolling mean/std/maxAbs/slope computed per `TEMPORAL_BASE_FEATURES` over a `temporal_window` of **5** (confirmed from the trained `data/models/feature_schema.json`), then only the last row's (current sample's) features are returned.
- **What Java sent:** `MLServiceClient.analyze(TwinSnapshot)` posted only `{telemetry, prediction, residuals}` for the *current* tick — no `history` field at all, so Python's default (`[]`) was always used.
- **Where the real history already existed:** `DiagnosticService.history: Deque<DiagnosticSnapshot>` (capped at 60), already built and already passed to `healthServiceClient.evaluate(base, new ArrayList<>(history))` and `degradationServiceClient.evaluate(...)` on the very next two lines of the same method — `MLServiceClient` was the one client in the chain not following this existing, established pattern.
- **Why it was empty, precisely:** `mlServiceClient.analyze(twinSnapshot)` was called *before* `history.addLast(complete)` (line order in `getCurrentDiagnostics()`), so the current sample was correctly excluded from what should have been sent — the bug was that nothing was sent at all, not an ordering problem.
- **Format mismatch requiring real code, not just wiring:** Health/degradation's existing history DTOs (`HealthDiagnosticInput`, `DiagnosticHealthInput`) are *nested* typed objects (`{telemetry:{...}, prediction:{...}, ...}`), matching those endpoints' strongly-typed Pydantic history models. `/ml/analyze`'s `history` is untyped and must be **flat** — sending a nested shape would have passed request validation (since `dict[str, Any]` accepts anything) but silently produced a DataFrame with `telemetry`/`prediction`/`residuals` as three single object-valued columns instead of individual `rpm`/`egt`/... columns, failing `validate_dataset`'s required-columns check. This is why a new flattening method was needed rather than reusing `HealthServiceClient`'s existing per-sample DTO.

#### Fix

`MLServiceClient.analyze(TwinSnapshot, List<DiagnosticSnapshot> history)` (signature changed) now builds `List<Map<String,Object>>` by flattening each history sample's `telemetry()`/`physicsPrediction()`/`residuals()` via the Spring-managed `ObjectMapper` (constructor-injected, not `new ObjectMapper()` — avoiding the exact BUG-3 mistake) and posts it alongside the current sample in a new private `MLAnalyzeRequest` record mirroring Python's top-level shape. `DiagnosticService.getCurrentDiagnostics()` now calls `mlServiceClient.analyze(twinSnapshot, new ArrayList<>(history))`, matching the health/degradation calls exactly.

**A real bug was found and fixed during live verification, not just unit testing:** the first live attempt returned `500`s from Python (`"Dataset contains missing values in required columns"`). Root cause: `runId` was included on the *current* sample (via the top-level request field) but not on each flattened *history* row. Python's `build_live_features` only whole-column-defaults a missing field when it's absent from **every** row; since the current row had it, the column existed, leaving history rows' `runId` cell null — and `runId` is one of `validate_dataset`'s required columns. Fixed by adding `runId` to every flattened history row, and locked in with a new Java test assertion (`row.has("runId")`) so this can't silently regress. This was caught by testing the actual live wire contract, not assumed correct because the unit tests (which used empty/short histories) passed.

#### Direct-contract verification (not just "the endpoint returns 200")

- Temporarily instrumented both the Python route and `registry.analyze()` with debug prints, restarted, drove several live ticks, and read the actual request bodies Python received: confirmed `historyLen=1, 2, 3...` growing correctly, confirmed each history row was flat (`rpm`, `expectedRpm`, `rpmResidual` all top-level keys, no nested `telemetry`/`prediction`/`residuals` keys) — then removed the instrumentation and confirmed `git diff` on both touched Python files was empty (clean revert).
- Two new Python tests (`test_ml_history_integration.py`) using the real trained artifacts under `data/models/` and the real offline dataset generator (not fabricated numbers): confirmed `registry.analyze()` returns a **different** anomaly score for the identical current sample depending on whether real history or empty history is supplied, and confirmed rolling `_slope_5`/`_rollingStd_5` features are provably zero with empty history and provably non-zero with 5 real history samples.
- New Java tests (`MLServiceClientTest`, `DiagnosticServiceTest`): assert the request body's `history` array is flat and non-nested, assert `runId` is present on every row (regression-locking the bug above), and assert — via `ArgumentCaptor` across three consecutive `getCurrentDiagnostics()` calls — that each tick's history contains exactly the prior ticks' samples and never the current one, and that `resetHistory()` correctly empties what the next tick sends.

#### Behavioral verification — measured, not assumed (§15's own explicit instruction: "do not assume it will necessarily become correct")

All 5 scenarios re-run live against the real stack, same methodology as §15.3 (severity=0.9 override, real ~120s onset wait, repeated polling to build real history). **The fix genuinely changes what Python receives and computes (proven above) — the question tested here is what effect that has on the end-to-end diagnosis.**

- **NORMAL:** unaffected — `HTTP 200` throughout (the raw-500 bug found and fixed during this session's own instrumentation work was pre-fix-verification-only, never present in the final delivered code), health stabilizes to `HEALTHY`/`NORMAL` exactly as in every prior session.
- **Injector Degradation:** **no material change.** Anomaly score stayed ~0.55–0.57 throughout onset and a full natural ramp (tested both fixed-severity and the natural ~240s ramp to rule out "instant plateau vs. gradual ramp" as the explanation) — still below the 0.6124 threshold, still classified toward `SENSOR_DRIFT` rather than `INJECTOR_DEGRADATION`. **Investigated further, not left unexplained** — see new Finding 4 below, which shows this is *not* a history problem at all.
- **Lubrication Degradation:** **measured, not improved.** Session 4 (pre-fix) showed 6/8 correct (`PHYSICAL_FAULT`/`LUBRICATION_DEGRADATION`) polls; this run showed 1/8, with scores clustered tightly at 0.59–0.61 — right at the 0.6124 threshold. This reads as genuine run-to-run boundary noise for a borderline case, not a regression or an improvement; reporting the honest number rather than the more flattering one.
- **Misfire:** **real, measured improvement.** Session 4 (pre-fix) showed `anomaly=False` on every single poll. This run showed `anomaly=True` on 6 of 12 polls, including **3 consecutive** correct `MISFIRE`/`PHYSICAL_FAULT` results (score 0.633–0.641). Misfire's per-tick probabilistic "event" design means some ticks now cross the threshold when they didn't before.
- **Sensor Drift:** **no change, as expected.** `diagnosticType` stayed `NORMAL` for the full ~323s window (comparable to §15.3's ~340s), health stayed safely in the HEALTHY band (93–96) throughout — matches the FINDING-3 root cause exactly, which is a `health_calculator` isolation-heuristic property independent of ML history, so no change here is the *correct*, expected result, not a failure of this fix.

#### New Finding 4 (P1, found this session — supersedes part of Finding 1's framing) — a physics-model divergence between live and offline-trained telemetry, not (only) missing history, is the dominant cause of live misclassification

Directly tested with a controlled comparison (not inferred): took a real, offline-generated Injector Degradation sample (from `scripts/generate_dataset.py`'s own `generate_records()`, seed 42, severity 0.9, well past onset) that the trained classifier correctly identifies with **99.48% confidence** when analyzed with the fixed code path (`registry.analyze()`, real 5-sample history) — then verified this 99.48%-confidence result is **completely unaffected** by swapping in `missionPhase="IDLE"` (the live simulator's permanent, never-changed value — confirmed no code path anywhere calls `SimulationState.setMissionPhase()`, so live telemetry is always `IDLE`, a value `physics-service/app/simulation/mission_generator.py`'s `mission_conditions()` **never produces during training data generation**, which only cycles TAKEOFF/CLIMB/CRUISE/LOITER/DESCENT/LANDING) and by swapping in the live simulator's constant operating point (`altitude=0, throttle=0.8, load=0.7`, vs. training's CRUISE-typical `altitude=5000, throttle=0.62, load=0.45`). Both swaps left the 99.48% confidence unchanged. **This rules out `missionPhase`/operating-point mismatch as the cause.**

What actually differs between "the offline sample the classifier gets right" and "the live sample the classifier gets wrong" is the underlying **telemetry and residual values themselves** — because live telemetry's healthy baseline comes from `HealthyEngineSimulator.java` (Java, its own from-scratch reduced-order formulas), while every offline training sample's healthy baseline comes from a *different*, independently-implemented Python healthy-telemetry generator (`physics-service/app/simulation/mission_generator.py`'s `next_healthy_telemetry`/related functions, used only by the offline dataset generator). The same fault model applied on top of two different "healthy" reference curves does not necessarily produce the same residual signature, even at identical nominal severity — and the classifier was trained exclusively on the Python-generated signature.

**Classification: physics/model limitation** (a training/live-distribution mismatch from two independently-built healthy-engine reference models) — **not** an integration bug in the history wiring (which is now confirmed correct and working), and **not** fixed this session: reconciling or unifying Java's and Python's healthy-engine models is a substantial, separate architectural undertaking, exactly the kind of "second major architectural task" to document rather than fold into this one. This finding **also directly explains why Misfire measurably improved while Injector Degradation did not**: Misfire's fault signature is large, abrupt, per-tick perturbations (rpm/egt/vibration swings on "event" ticks) that are big enough to cross the anomaly threshold even against a shifted baseline, whereas Injector Degradation's steadier, smaller-magnitude signature apparently isn't.

#### Is the anomaly-recall issue "resolved, improved, or still present"?

**Still present, but now correctly diagnosed rather than assumed.** The specific integration bug (missing history) is fixed, verified at both the direct-contract and behavioral level, and does have a real, measured, positive effect on Misfire. It is not, by itself, sufficient to fix Injector Degradation or Sensor Drift live, because the dominant cause for those is Finding 4 (a physics-model divergence), not the history gap. Do not report the original anomaly-recall issue as resolved — it is now better-understood and partially improved, with a specific, well-evidenced remaining cause identified for further work.

#### Before / After

| Metric | Before (session 4) | After (session 5) |
|---|---|---|
| ML history received | Always `[]` (never sent) | Real, growing history (`historyLen=1,2,3...`), verified via direct request-body instrumentation |
| Rolling-window size | Degenerate (window of 1) — slope/std always 0 | Real up-to-5-sample rolling window; proven non-degenerate via `test_ml_history_integration.py` |
| Anomaly behavior (general) | Almost never fired live (2 of 4 faults never triggered `anomaly=True` at all) | Still borderline overall, but now fires intermittently for Misfire (measured) and Lubrication (unchanged borderline); root cause for the remaining gap now identified (Finding 4) rather than attributed solely to missing history |
| Injector diagnosis | `SENSOR_FAULT`/`fuelFlow`, `anomaly=False` throughout | **Unchanged**: `SENSOR_FAULT`/`fuelFlow`, `anomaly=False` throughout (fixed severity *and* natural ramp both tested) |
| Lubrication diagnosis | 6/8 polls correct (`PHYSICAL_FAULT`/`LUBRICATION_DEGRADATION`) | 1/8 polls correct this run, scores clustered at the 0.6124 threshold — boundary noise, not a clear regression or fix |
| Misfire diagnosis | `anomaly=False` on every poll (0/8) | `anomaly=True` on 6/12 polls, including 3 consecutive correct `MISFIRE`/`PHYSICAL_FAULT` — **real, measured improvement** |
| Sensor Drift diagnosis | `diagnosticType=NORMAL` throughout ~340s, health never left HEALTHY band | `diagnosticType=NORMAL` throughout ~323s, health never left HEALTHY band — **unchanged, as expected** (root cause is unrelated to ML history) |

### 15.5 FINDING-4 Investigation — Architecture/Scoping Session (session 6, 2026-09-09)

**Status: investigated and root-caused with high confidence. NOT resolved, NOT implemented.** This section documents the evidence and the recommended path forward for a future implementation session.

#### Objective

Determine precisely why the same modeled fault (Injector Degradation) is correctly classified from offline/training telemetry (99.48% confidence, §15.4) but misclassified live, given the missing-history integration bug is already fixed (session 5) and known not to be the (sole) cause.

#### Phase 1 — Mapping both telemetry generators (source-level)

**Java live simulator:** `backend/src/main/java/com/aerotwin/simulator/HealthyEngineSimulator.java`. Self-contained, independent formulas for rpm/egt/cht/oilTemperature/oilPressure/fuelFlow/vibration, driven only by `throttle`, `load`, `altitude`, `ambientTemperature` (mission phase is *not* an input to any Java formula). Maintains its own persistent first-order-filter state (`currentCht`, `currentOilTemp`) across ticks. Adds small deterministic sinusoidal noise terms per channel. `battery voltage` constant 14.2.

**Python offline/training generator:** `physics-service/app/simulation/mission_generator.py`. Critically, **this file has no independent physics of its own for the "healthy" state.** `next_healthy_telemetry()` builds the operating context (mission phase/altitude/ambient/throttle/load from `mission_conditions()`), then calls `predict_healthy_state()` — the exact same function `/physics/predict` exposes — and sets `healthy.rpm = prediction.expectedRpm`, `healthy.egt = prediction.expectedEgt`, etc., for every channel. **This means, by construction, offline "actual" (healthy) telemetry is always mathematically identical to the physics-predicted "expected" state — training-data residuals are exactly zero at baseline, always, for every healthy sample, with no exceptions.** Confirmed empirically: `data/generated/healthy_missions.csv`'s residual columns have `mean=0.0, std=0.0, min=0.0, max=0.0` across all 7 residual channels, every row.

Full formula-by-formula comparison (`physics-service/app/physics/{engine_model,combustion,thermal,airflow,environment}.py` vs Java `HealthyEngineSimulator.java`):

| Channel | Java formula | Python `predict_healthy_state` formula | Divergence |
|---|---|---|---|
| RPM | `IDLE_RPM + throttle·4600 - load·500` (+ sin noise) | Same base **+ air-density correction + mission-phase correction** (`IDLE` = **−100**) | Java omits both correction terms entirely |
| EGT | `ambient + fuelHeat/1000` (+ sin noise); AFR = `14.7 − 2·throttle` | Same base **÷ cooling_factor, + 10·throttle + 120·load**; AFR = `14.7 − 2·throttle + 0.5·load` | Java omits the throttle/load additive terms (dominant at throttle=0.8, load=0.7: **+92°C** in Python, absent in Java) and the cooling-factor division; AFR formula also differs slightly |
| CHT | first-order filter, rate **0.05**, target = `ambient + egt·0.25`, anchored to Java's own prior value | first-order filter, rate **0.10** (2× faster), same target formula, but anchored to **the actual telemetry's own previous CHT** (`expected_cht_c(telemetry.cht, ...)`) | Same functional form, different rate; and critically, Python's "expected" for this channel is itself partially a function of whatever "actual" currently is — see Finding 2 (§8), now understood as a special case of this same divergence |
| Oil Temperature | first-order filter, rate **0.02** | first-order filter, rate **0.04** (2× faster), anchored to actual `telemetry.oilTemperature` | Same pattern as CHT |
| Oil Pressure | `200 + rpm·0.05`, penalty if oilTemp>80 (+ sin noise) | Identical formula, no noise, but fed **Python's own expected rpm/oilTemp** (not Java's) | Structurally identical; diverges only because its rpm/oilTemp inputs already diverge |
| Fuel Flow | `airflow(java_rpm)/afr_java` | `airflow(py_rpm)/afr_py` | Structurally identical; diverges via rpm and AFR differences above |
| Vibration | `(rpm/1000)·1.5 + load·2` (+ cos noise, phase = elapsed session time) | Same formula, no equivalent noise term (cos phase = absolute epoch timestamp) | Minor — small-magnitude noise-only difference |
| Battery Voltage | constant 14.2 | constant 14.2 (not used in any ML feature — excluded from `RESIDUAL_FEATURES`) | None, and irrelevant to the model |

**Mission phase is not the cause on its own** — RPM's `phase_correction` table exists in Python and is genuinely absent from Java, but a direct test (below) proves this alone doesn't explain the misclassification; it's one contributing term among several.

#### Phase 2 — Quantitative comparison

Rather than only comparing formulas on paper, both sides were evaluated at the live simulator's actual operating point (`throttle=0.8, load=0.7, altitude=0, ambientTemperature=15, missionPhase=IDLE` — confirmed this is *permanently* the live operating point: no code path anywhere calls `SimulationState.setMissionPhase()`, so live `missionPhase` never changes from its `IDLE` default) and cross-checked against a fresh live capture (5 consecutive `GET /api/twin/current` samples, backend and physics service both freshly started):

| Channel | Hand-calculated predicted residual (Java actual − Python expected) | Live-observed residual (5 fresh samples) | Match |
|---|---|---|---|
| rpm | **+100.0** | +94.6 to +109.1 | Excellent |
| egt | **−49.8** | −47.4 to −54.9 | Excellent |
| cht | −12.5 (steady-state estimate; convergence-rate-dependent) | −14.9 to −22.9 | Same sign, right order of magnitude |
| oilTemperature | +1.5 (steady-state estimate) | −2.7 to −3.2 | Sign differs — explained by convergence-state coupling (Python's "expected" for this channel partially tracks whatever Java's actual currently is, per Finding 2, making a clean steady-state prediction imprecise for this specific channel) |
| oilPressure | +2.0 | +2.8 to +7.1 | Same sign, right order of magnitude |
| fuelFlow | +1.36 | +1.33 to +1.42 | Excellent |
| vibration | +0.15 | −0.62 to +0.86 (noise-dominated) | Consistent with a small signal buried in both sides' independent noise terms |

**This is decisive: the live "baseline residual gap" — present even with zero fault active — is fully and quantitatively explained by the formula differences alone**, to within the precision expected given two channels' convergence-state dependence and small noise terms. This is not a hypothesis anymore; it is confirmed by matching a from-source hand-calculation to fresh live data within single-digit percentage error on the two dominant, cleanest channels (rpm, egt).

#### Phase 3 — Injector Degradation fault-path comparison

**Offline** (from `data/generated/injector_degradation.csv`, run 0, well past onset, severity≈1.0): residual vector is `rpm≈−88.7, egt≈+81.3, cht≈+24.0, oilPressure≈0.0, fuelFlow≈+2.65, vibration≈0.0` — this is a **clean, isolated fault signature**: exactly the `InjectorDegradation.apply()` perturbation, because the healthy baseline underneath it is exactly zero residual by construction. This is precisely the pattern the classifier was trained to recognize as `INJECTOR_DEGRADATION` (99.48% confidence when analyzed directly, §15.4).

**Live** (session 5's captured Injector Degradation run, severity 0.9, well past onset): residual vector was `rpm≈+23.8, egt≈+23.1, cht≈+0.9, fuelFlow≈+7.87` (oilPressure/vibration untouched by this fault, as expected).

**Where the two diverge, in one number:** the RPM channel **flips sign**. Offline: strongly negative (−88.7, the fault dominates). Live: mildly *positive* (+23.8), because live's baseline gap (+100, Java's RPM formula runs high) partially cancels the fault's own effect (−72 at severity 0.9): `+100 − 72 ≈ +28`, closely matching the observed +23.8. EGT and CHT are both damped in magnitude for the same reason (baseline gap and fault effect partially offsetting or compounding differently than in the noiseless offline case). **The live residual vector is not "the injector fault signature plus noise" — it is structurally a different vector, in one channel even pointing the opposite direction from what the model was trained to associate with this fault.** This is why the classifier, which learned a specific multi-dimensional decision boundary from the clean offline vectors, does not recognize the live vector as the same class — and, per session 5's finding, tends to fall back toward `SENSOR_DRIFT`, a class characterized by smaller, more diffuse, less RPM-dominated deviations, which is a closer (if still incorrect) match to what the corrupted live vector looks like.

**Exact stage of divergence:** Telemetry generation (the "actual"/healthy-baseline step) — *before* physics prediction, residual computation, feature engineering, or the ML model are ever reached. Every downstream stage (physics/predict, residual math, feature engineering, the classifier itself) is confirmed working correctly and consistently on both sides; they are being fed structurally different inputs.

#### Phase 4 — Architecture options considered

**Option A — Port Python's exact formulas into Java, keeping two independent implementations numerically synchronized.** Rejected: this is the same "second independent implementation" anti-pattern already flagged and avoided twice in this project (the fault-injection design in session 4 explicitly routed through Python instead of duplicating `fault_models.py` in Java, for exactly this reason). Two hand-synchronized formula sets in two languages will drift again the moment either side changes — arguably how this problem arose in the first place, since `HealthyEngineSimulator.java` almost certainly predates `physics-service`'s physics module (README's own "Phase 1 Architecture" describes Java owning "deterministic healthy-engine simulation" as the foundational, pre-physics-service piece).

**Option B — Unify healthy-telemetry generation in Python; Java's live loop sources "actual" telemetry from the same `predict_healthy_state()` that already computes "expected," reusing the already-existing fault-injection path.** This is the option this investigation recommends — see below.

**Option C — Adapt the offline/training generator to match Java's formulas (retrain on Java-sourced ground truth).** Rejected: requires either porting Java's formulas into Python (same duplication problem as Option A, just reversed) or making the offline batch dataset generator depend on a live Java service being reachable (inverts the natural relationship — dataset generation should not require a running application server), and does not remove the underlying architectural inconsistency, only patches around today's specific symptom.

**Option D — Add a cross-implementation regression check without unifying the code.** Considered as a *complement*, not an alternative: a test that calls both Java's simulator and Python's `/physics/predict` at matched operating points and asserts residuals stay within a small tolerance would catch future silent drift, but does not fix today's problem (the drift already exists and is large). Worth adding *alongside* Option B, not instead of it.

#### Recommendation

**Option B.** Python already owns every other piece of domain physics/ML/health/degradation/mission logic in this system (§4 Architecture; every `*ServiceClient` in `backend/src/main/java/com/aerotwin/service/` is a thin HTTP orchestrator over Python-owned logic). `HealthyEngineSimulator.java` computing its own independent "healthy" physics is the one architectural exception, and it is exactly the piece now shown to be the root cause. Making it consistent with the rest of the codebase both fixes the bug and removes an architectural inconsistency, at the cost of zero duplicated logic (one source of truth) versus Option A's permanent duplication risk.

**Key enabling fact:** the fault-injection path built in session 4 (`POST /simulation/inject-fault`) already accepts a "healthy" telemetry input and perturbs it — it does not care whether that input came from `HealthyEngineSimulator.java` or from Python's own `predict_healthy_state()`. If Java sources the "healthy" tick from `PhysicsServiceClient.predict()` (already exists, already used for "expected") instead of `HealthyEngineSimulator`, the live pipeline becomes structurally identical to the offline pipeline by construction — NORMAL residuals become exactly zero (matching training), and fault residuals become the clean, isolated fault signature the classifier was actually trained on — with zero changes to any fault model, the ML pipeline, health/degradation/RUL, or mission logic.

**This is not proposed as certain to fully resolve Injector Degradation's classification** — per the task's own acceptance criteria, that must be measured after implementation, not assumed. It is proposed because it removes the now-confirmed, dominant, root-cause discrepancy; whether the classifier then generalizes perfectly or only substantially better is exactly what the next session's Phase 7 verification must determine (see below), and either outcome must be reported honestly.

#### Files likely involved (next implementation session, not now)

- `backend/src/main/java/com/aerotwin/simulator/HealthyEngineSimulator.java` — replaced or reworked to source its output from `PhysicsServiceClient` instead of independent formulas.
- `backend/src/main/java/com/aerotwin/service/SimulationService.java` — `tick()` restructured: fetch the healthy baseline (now physics-service-sourced) before optionally routing it through `FaultInjectionServiceClient` exactly as it already does.
- `backend/src/main/java/com/aerotwin/service/PhysicsServiceClient.java` — likely reused as-is (already calls `/physics/predict`); may need a small addition if per-tick CHT/oil-temperature state threading (the two "anchored to previous actual" channels) requires passing the prior tick's values explicitly.
- `backend/src/test/java/com/aerotwin/simulator/HealthyEngineSimulatorTest.java` — will need to be understood and likely rewritten against the new implementation's behavior (current assertions are formula-specific).
- Possibly a small new field in `SimulationState` (or equivalent) to carry the previous tick's cht/oilTemperature forward, mirroring how `next_healthy_telemetry()` threads `previous.model_copy(...)` offline.

#### Files that should explicitly NOT change

- All of `physics-service/app/physics/*.py` (the validated equations themselves).
- `physics-service/app/simulation/fault_models.py`, `FaultSchedule`, and `/simulation/inject-fault` (session 4's endpoint and contract, reused as-is, not modified).
- All ML code: `app/ml/inference.py`, `anomaly_detector.py`, `fault_classifier.py`, `feature_engineering.py`, the trained model artifacts themselves.
- `app/health/health_calculator.py`, `app/degradation/degradation_estimator.py`, all mission simulation/risk logic (`app/mission/*.py`).
- The offline dataset generator (`scripts/generate_dataset.py`, `app/simulation/mission_generator.py`, `app/simulation/dataset_generator.py`) — remains the source of truth for training data; no need to touch it, since Option B makes Java converge toward what it already does, not the reverse.
- `MLServiceClient`, `DiagnosticService`'s history wiring (session 5) — unrelated and already correct.

#### Verification plan (for the next implementation session)

1. Java (`mvnw test`) and Python (`pytest -q`) full suites green, including a rewritten `HealthyEngineSimulatorTest` reflecting the new source of "healthy" telemetry.
2. Frontend `npm run build` green (no frontend changes expected).
3. Live NORMAL: confirm residuals are now at or near zero (not exactly zero, if any live-only noise is retained by design) rather than the current +90 to −55 baseline gap — this is the direct, falsifiable signature that the fix landed.
4. Live Injector Degradation (fixed severity and natural ramp, same methodology as sessions 4/5): capture the residual vector and compare directly to the offline signature (`rpm≈−89, egt≈+81, cht≈+24, fuelFlow≈+2.65`) — the live vector should now resemble this shape, at least directionally (RPM should go negative, not positive).
5. Feed that live vector to `registry.analyze()` directly (same technique as §15.4's controlled comparison) and record the actual anomaly score and classification — report the real number, not an assumption of success.
6. Re-run all 4 fault scenarios end-to-end live (Lubrication, Misfire, Sensor Drift too) to confirm no regression — Lubrication and Misfire currently show partial/positive signal that must not be lost; Sensor Drift's isolation gap (FINDING-3, independent of this fix) is expected to remain unchanged.
7. Confirm the Python-unavailable fallback behavior explicitly (see Risk below) — decide and test what live telemetry generation does when `/physics/predict` is unreachable, since `HealthyEngineSimulator` currently guarantees telemetry availability independent of Python being up (`README`'s documented, intentional resilience property) and Option B puts that at risk unless deliberately preserved.
8. Update the master file with the real, measured before/after result — do not mark this resolved without live evidence, exactly as sessions 4 and 5 did.

#### Remaining uncertainty (explicitly not resolved by this investigation)

- Whether the classifier, once fed a live vector shaped like the offline one, actually crosses the anomaly threshold and correctly labels `INJECTOR_DEGRADATION` — the hypothesis is strong (offline data with the same shape scores 99.48%) but **not yet tested with a truly live-generated (not hand-constructed) vector**, since implementing Option B is explicitly out of scope for this session.
- The correct behavior when the physics service is unavailable, given live telemetry generation would gain a new dependency on it under Option B (currently, telemetry generation has zero Python dependency — this is a real, not-yet-resolved design trade-off, not an oversight).
- Whether to retain Java's small sinusoidal noise terms in some adapted form (for live "liveliness") or drop them entirely to match training's exact-zero-residual assumption — a minor design choice, not blocking, to be decided during implementation.
- Whether Option B alone is *sufficient* for Injector Degradation, or whether some residual gap will remain (e.g. from the vibration channel's independent noise sources, or from feature-engineering interactions not yet examined) — only live re-testing after implementation can answer this.

### 15.6 FINDING-4 — RESOLVED (implementation session, 2026-09-09)

**Status: RESOLVED at the healthy-baseline and classifier level, confirmed with quantitative live evidence.** A separate, pre-existing, already-tracked issue (anomaly-detector threshold/recall, §9) remains and is explicitly not part of this fix's scope.

#### Architecture implemented (Option B, exactly as recommended in §15.5)

`HealthyEngineSimulator.java` no longer computes independent physics. It now builds a context `Telemetry` (mission-state fields from `SimulationState`, plus the previous tick's own CHT/oil-temperature threaded forward as instance state — mirroring exactly how the offline generator threads `previous.model_copy(...)`), calls the existing `PhysicsServiceClient.predict()` (the same client `TwinService` already used for "expected"), and maps the returned `PhysicsPrediction` fields directly onto the returned `Telemetry` (`expectedRpm→rpm`, `expectedEgt→egt`, etc.) with **zero additional computation**. `SimulationService.tick()` is unchanged — it still calls `simulator.generateNextTick(...)` then routes the result through the existing, untouched `FaultInjectionServiceClient` exactly as before. No fault model, ML code, health/degradation/RUL logic, mission logic, or the offline dataset generator was touched.

#### Root cause (confirmed, brief)

Java's independent healthy-physics formulas produced a permanent, nonzero residual baseline (even with no fault active) that the ML classifier — trained exclusively on offline data where healthy residuals are exactly zero by construction — had never seen. For Injector Degradation specifically, this baseline gap flipped the sign of the RPM residual relative to the training signature. Full quantitative derivation in §15.5.

#### Fallback behavior (Python unavailable)

**Chosen: retain the last valid canonical physics state (option "b" from the task), never fabricate new independent physics.** `HealthyEngineSimulator` catches `PhysicsServiceClient.PhysicsServiceUnavailableException` internally: on failure, `previousCht`/`previousOilTemperature` are intentionally left unmodified (frozen at their last successful value), and the last successfully-computed `Telemetry` is reused with a refreshed timestamp only — no local math recomputes new physics. A new `isHealthyBaselineFresh()` method (added to the `EngineSimulator` interface as a default method, so it doesn't break the interface contract for other implementations) reports this, surfaced through `SimulationService.getFaultState()` into a new `healthyBaselineFresh` field on `SimulatorFaultState` (`GET`/`POST /api/simulator/fault`). If Python has never once succeeded (e.g. down since backend startup), a one-time bootstrap seed is used — matching the offline generator's own cold-start seed values (`rpm=1000, egt=ambient+20, cht=ambient+10, oilTemperature=ambient+5, oilPressure=240, fuelFlow=2.0, vibration=1.5`), not an independently-invented Java default.

**Verified live:** killed the physics service mid-session. `GET /api/simulator/fault` correctly flipped to `"healthyBaselineFresh": false`. `GET /api/telemetry/current` stayed available (200, matching the pre-existing documented resilience guarantee) with rpm/egt frozen at their exact last-known values while the timestamp kept advancing. `GET /api/twin/current` — a completely separate, pre-existing dependency on Python for "expected" computation — correctly continued returning `503 physics-unavailable`, exactly as it always has (unchanged, unaffected by this session's work). Restarted Python: `healthyBaselineFresh` returned to `true` and residuals resumed near-zero within one tick — no manual recovery needed.

#### Healthy Baseline Evidence (primary falsification test)

20 live samples of `/api/twin/current`, ~1.5s apart, fresh backend/physics-service restart, NORMAL condition:

| Channel | Mean | Std | Min | Max |
|---|---|---|---|---|
| rpmResidual | **0.0000** | 0.0000 | 0.0000 | 0.0000 |
| egtResidual | **0.0000** | 0.0000 | 0.0000 | 0.0000 |
| chtResidual | −0.0014 | 0.0012 | −0.0041 | −0.0002 |
| oilTemperatureResidual | −0.0648 | 0.0231 | −0.1087 | −0.0333 |
| oilPressureResidual | 0.1296 | 0.0462 | 0.0665 | 0.2174 |
| fuelFlowResidual | **0.0000** | 0.0000 | 0.0000 | 0.0000 |
| vibrationResidual | **0.0000** | 0.0000 | 0.0000 | 0.0000 |

Compare to the pre-fix baseline (§15.5 Phase 2): rpm ~+100, egt ~−50, cht ~−13 to −23, oilTemperature ~−3, oilPressure ~+2 to +8, fuelFlow ~+1.3 to +1.4. **5 of 7 channels are now exactly zero.** The two nonzero channels (CHT, oil temperature) are the first-order-filtered channels whose "expected" calculation is itself partially anchored to the current actual value (§8 FINDING-2) — these were directly observed **monotonically converging toward zero** over ~35s of continuous operation (CHT: −0.47 → −0.02; oil temperature: −0.68 → −0.20, both shrinking geometrically tick-over-tick, consistent with two one-tick-offset invocations of the same shared first-order filter formula converging toward the same fixed point). The residual oil-pressure figure (+0.13 mean) is fully explained as a downstream consequence of oil-temperature not yet being fully converged (`oilPressure -= (oilTemp−80)·2`, so a −0.065 oil-temp gap predicts a +0.13 oil-pressure gap — matches exactly).

#### Physics Equivalence

Direct side-by-side: `GET /api/telemetry/current` (Java live) vs. a direct `POST /physics/predict` call (Python) with the identical operating context. **`rpm: 4550.003004` vs. `4550.003004`; `egt: 962.332907` vs. `962.332907` — exact match to 6 decimal places.** No tolerance is needed for the context-driven channels (rpm, egt, oilPressure, fuelFlow, vibration) because they are, by construction, outputs of the identical function call — Java's live telemetry literally *is* a `/physics/predict` response, not an approximation of one. For the two filter-anchored channels (CHT, oil temperature), the appropriate tolerance is a convergence bound, not a fixed epsilon: empirically, the gap shrinks below 0.1 within ~30-35s of continuous operation from a cold start, and the two implementations share the exact same target formula (only the "previous" anchor differs by one filter step), so the bound is mathematically guaranteed to approach zero, not just observed to.

#### Fault Results

**Injector Degradation** (severity 0.9, past onset) — residual vector: `rpm=−80.13, egt=+72.87, cht=+2.16, oilTemp≈0, oilPressure≈0, fuelFlow=+6.22, vibration≈0`. Compare pre-fix (§15.5): `rpm=+23.8` (wrong sign), `egt=+23.1`, `cht=+0.9`, `fuelFlow=+7.87`. Compare offline training signature: `rpm≈−88.7, egt≈+81.3, cht≈+24.0, fuelFlow≈+2.65`. **The RPM sign is now correct** (negative, matching training) and its magnitude is close (−80.1 vs. −88.7). EGT sign and magnitude are close (+72.9 vs. +81.3). **Fed to the real trained classifier (not hand-constructed, read directly from the live system): `faultProbabilities: {INJECTOR_DEGRADATION: 0.9779, LUBRICATION_DEGRADATION: 0.0146, SENSOR_DRIFT: 0.0044, MISFIRE: 0.0017, NORMAL: 0.0014}`** — compare pre-fix session 5/6 evidence where `INJECTOR_DEGRADATION` probability was ~0.05–0.22 and `SENSOR_DRIFT` dominated at ~0.77–0.94. **This is the decisive result: the classifier now correctly and confidently identifies the fault, closely matching the offline 99.48%-confidence result (§15.4/§15.5) it was previously unable to reach live.** `anomalyScore` was 0.558 (threshold 0.6124) — the separate anomaly-detector gate did not cross threshold on this particular sample, so `predictedFault` in the final API response still showed `NORMAL` this tick (see "Remaining Limitations" below) — but the classifier's own internal signal, which is what FINDING-4 concerns, is unambiguously fixed.

**Lubrication Degradation** — `faultProbabilities.LUBRICATION_DEGRADATION` held at **0.980–0.981 across all 8 consecutive live polls** (compare pre-fix session 5: scores clustered right at the 0.6124 anomaly threshold with only 1/8 polls crossing it; classifier confidence itself was not previously measured this precisely, but the overall diagnosis flickered far more). `anomaly=True` on 1 of 8 polls (score 0.615, just past threshold). Health, degradation, and dominant-mechanism (`LUBRICATION`/`LUBRICATION_DEGRADATION`) all tracked correctly and consistently.

**Misfire** — `faultProbabilities.MISFIRE` held at **0.973–0.979 across all 8 consecutive live polls** (a real, stable, high-confidence result — pre-fix session 5 showed real but much less consistent improvement, 6/12 anomaly detections with no probability figures recorded). `anomaly=True` on 1 of 8 polls (score 0.618). The probabilistic per-tick event pattern (alternating event/no-event ticks) continues to behave correctly, unaffected by this change (fault semantics untouched).

**Sensor Drift** — `faultProbabilities.SENSOR_DRIFT` held at **0.979–0.982** across live polls in a ~313s continuous run. `diagnosticType` stayed `NORMAL` throughout (isolation still does not trigger — confirmed unaffected by this fix, exactly as predicted, since FINDING-3 is an independent `health_calculator` multi-channel-isolation issue, not a classifier-confidence issue). Core safety property held: `overallHealth` stayed in the 94.8–96.6 HEALTHY range throughout — no fabricated catastrophic diagnosis, matching every prior session's result for this fault.

**No hardcoded fault-to-classification mapping was introduced anywhere.** Every number above comes from the real, unmodified, already-trained classifier and anomaly detector, fed a corrected but otherwise ordinary live feature vector.

#### Regression Tests

```
Java (backend):  mvnw test → 48/48 PASS, BUILD SUCCESS (43 pre-existing + 5 new/changed:
                 EngineSimulator default method, HealthyEngineSimulator full rewrite +
                 5 new tests replacing the old 2, SimulatorFaultState +1 field with test
                 updates across SimulatorControllerTest/SimulationServiceTest)
Python (physics-service): pytest -q → 66/66 PASS, unchanged (no Python files modified)
Frontend: npm run build → PASS, 0 errors (no frontend files modified)
Live regression sweep: mission/simulate 200 OK, mission/what-if 200 OK (both produce the
                 same numbers as before — mission simulation has never depended on live
                 telemetry generation), WS /ws/telemetry confirmed streaming with a real
                 Node client, final state confirmed NORMAL/health=100.00 after full sweep
```

**New regression protection against FINDING-4 recurring:** `HealthyEngineSimulatorTest.mapsPredictionFieldsDirectlyOntoTelemetryWithNoAddedComputation` asserts the returned telemetry's rpm/egt/cht/oilTemperature are *exactly* the mocked prediction's fields — if a future change reintroduces any independent Java computation on top of the physics-service response, this test fails immediately. This was judged sufficient per the task's own "a simpler robust test is appropriate" allowance, rather than adding a live cross-service test to the default suite: the architecture now makes silent re-divergence structurally difficult (there is no formula left in Java to drift), and the live quantitative evidence above (physics equivalence to 6 decimal places) is the authoritative proof for this session.

#### Files Changed

- `backend/src/main/java/com/aerotwin/simulator/HealthyEngineSimulator.java` — full rewrite: delegates to `PhysicsServiceClient`, threads CHT/oil-temperature state, implements the frozen-fallback behavior.
- `backend/src/main/java/com/aerotwin/simulator/EngineSimulator.java` — added `isHealthyBaselineFresh()` default method.
- `backend/src/main/java/com/aerotwin/model/SimulatorFaultState.java` — added `healthyBaselineFresh` field.
- `backend/src/main/java/com/aerotwin/service/SimulationService.java` — `getFaultState()` now sources `healthyBaselineFresh` from the simulator.
- `backend/src/test/java/com/aerotwin/simulator/HealthyEngineSimulatorTest.java` — full rewrite (mocked `PhysicsServiceClient`, no live network call).
- `backend/src/test/java/com/aerotwin/controller/SimulatorControllerTest.java`, `backend/src/test/java/com/aerotwin/service/SimulationServiceTest.java` — updated for the new `SimulatorFaultState` field; one new test each.
- **Not changed:** `SimulationService.tick()`'s structure (only the pre-existing fault-injection call site is exercised, unchanged), `FaultInjectionServiceClient`, `physics-service/app/physics/*`, `fault_models.py`/`/simulation/inject-fault`, all ML code and artifacts, `health_calculator.py`, `degradation_estimator.py`, all mission logic, the offline dataset generator, and session 5's `MLServiceClient`/`DiagnosticService` history wiring.

#### Remaining Limitations (evidence-backed, not part of FINDING-4's scope)

1. **The anomaly-detector threshold gate is a separate, still-open, already-tracked issue (§9, older than FINDING-4).** The classifier now correctly identifies every fault with 97-98% confidence, but `predicted_fault = labels[0] if is_anomaly else "NORMAL"` still hides that correct answer behind the Isolation Forest's own score crossing 0.6124 — which it does intermittently (roughly 1 in 3-8 polls for Injector/Lubrication/Misfire in this session's testing), not reliably. This was never in scope for this fix (explicit instruction: do not redesign the ML system, do not lower/raise thresholds) and should be scoped as its own follow-up now that FINDING-4 no longer confounds it.
2. **FINDING-3 (sensor-drift multi-channel isolation) is confirmed unaffected**, exactly as predicted — still open, still a separate `health_calculator` issue.
3. CHT/oil-temperature residuals are not literally zero, only converging — a real, small, mathematically-understood, bounded artifact of the two channels' filter-anchoring design (§8 FINDING-2), not a new issue.
4. Live telemetry generation now has a dependency on the physics service that it did not have before; the chosen fallback (freeze last-known values) was verified live and behaves as designed, but represents a real, deliberate architectural trade-off documented here, not an oversight.

### 15.7 P1 Anomaly-Gate Investigation (session 8, 2026-09-09/2026-09-10)

**Objective:** with FINDING-4 resolved (session 7), the classifier is confirmed correct and confident (97-98%) for all 3 physical faults, yet the Isolation Forest anomaly-score gate (threshold 0.6124) — the thing that actually flips `predictedFault` away from `NORMAL` — still only crosses intermittently. Investigate *why*, without assuming the threshold itself is wrong, before touching anything.

**Explicit instruction honored: no threshold value changed until the evidence below was gathered.** No classifier-confidence hardcoding, no fault-type-selected hardcoding, and no removal of the gate were introduced anywhere.

#### Phase 1 — Implementation review

`AnomalyDetector` (`app/ml/anomaly_detector.py`): `IsolationForest(n_estimators=160, contamination="auto")` fit once on healthy-only training rows; score is a sigmoid of `decision_function` (`1/(1+exp(5·value))`, higher = more anomalous); threshold is the 95th percentile of the healthy set's own scores, computed at `fit()` time. No feature scaling anywhere in the class. `training.py` calibrates the threshold from `x_train.loc[healthy_train.index]` — **the exported metadata string said `"95th percentile of healthy validation anomaly scores"`, which was factually wrong** (it uses the train split, not validation). This is a real but minor documentation/metadata bug, unrelated to the threshold's actual value or the intermittency question — fixed (see "Changes" below). No dedicated test file existed for `AnomalyDetector` before this session (only indirect exercise via `test_ml_api.py`/`test_explainability.py` fixtures) — a real, pre-existing coverage gap, also fixed below.

#### Phase 2 — Live evidence, all 4 faults + NORMAL, full onset-to-plateau windows (not one or two ticks)

| Scenario | Pre-onset (t<120s) | Post-onset behavior | Classifier confidence post-onset |
|---|---|---|---|
| NORMAL | score 0.529-0.539, `anomaly=False` throughout (10 samples) | n/a | n/a |
| Injector Degradation | score 0.530-0.537, `anomaly=False` | Score rises to a **0.53→0.58 plateau** (t=129s→247s, 15 samples over ~118s past onset), **never once crosses 0.6124** | 97.6-97.8% (correct, from t=129s) |
| Lubrication Degradation | score 0.530-0.545, `anomaly=False` | Score jumps to **0.637-0.648**, `anomaly=True` on **4/4** samples from t=125s through t=163s | 98.7% (correct) |
| Misfire | score 0.529-0.541 (one transient blip at t=13s, score 0.618, likely a reset-transition artifact) | Score jumps to **0.622-0.636**, `anomaly=True` on **3/3** samples from t=139s through t=164s | 96.8-97.5% (correct) |
| Sensor Drift | score 0.529-0.543, `anomaly=False` | Score stays at a **0.53-0.55 plateau** through t=188s, `anomaly=False` throughout (matches §15.3/§15.6's already-documented "core safety property holds, isolation/anomaly does not trigger" behavior for this fault type — reconfirmed, not new) | 97.9-98.2% (correct, matches §15.6 exactly) |

**Live pattern: the gate reliably crosses for Lubrication and Misfire, and reliably does not for Injector and Sensor Drift.** This is not two-tick noise — it held across 47 total live samples spanning ~4-6 minutes per scenario.

#### Phase 3 — Training vs. live feature-distribution comparison (the decisive finding)

Four independent offline hypotheses were tested and **refuted** by controlled, single-variable experiments against the real training pipeline:

1. **Feature scaling** — fit a `StandardScaler` on healthy-train features, retrained the detector on scaled data: metrics and even the threshold value were bit-for-bit identical to the unscaled baseline. Expected: `IsolationForest` splits on uniformly-random features at uniformly-random split points within each feature's own range, so any monotonic per-feature linear transform cannot change tree structure.
2. **Severity-based dilution** (pooled across all fault types) — recall stayed ≤11.5% even at maximum severity (0.9-1.0 band), refuting "low recall is mostly near-onset/low-severity noise."
3. **Feature-mode/composition** — AUC stayed 0.57-0.61 across `hybrid` (88 features), `raw` (67), and `residual` (69) modes, refuting "irrelevant raw features dilute the residual signal."
4. **Offline separability (AUC-ROC)**: validation 0.5933, test 0.5980 — barely above chance (0.5). A full threshold-percentile sweep (99th→50th) showed recall only reaches 50-63% once healthy FPR is pushed to 38-43% — an operationally unacceptable trade for any percentile choice on this ROC curve.

**Per-fault-type offline sustained crossing rate (post-onset, high-severity ≥0.8, held-out test split):**

```
INJECTOR_DEGRADATION    n=85  recall=0.059  meanScore=0.508
LUBRICATION_DEGRADATION n=85  recall=0.047  meanScore=0.522
MISFIRE                 n=85  recall=0.235  meanScore=0.578
SENSOR_DRIFT             n=85  recall=0.047  meanScore=0.495
NORMAL (healthy FPR)     —     FPR=0.043-0.067
```

**All four fault types are statistically indistinguishable from the healthy false-positive rate offline** — including Lubrication Degradation, which crosses the gate reliably (4/4) live. This was directly re-confirmed with a fresh, matched-parameter offline generation (`DatasetConfig(LUBRICATION_DEGRADATION, fault_start_seconds=120, fixed_severity=0.9)`, the exact same severity/onset the live run used): post-onset offline scores sat at **0.49-0.57**, `detected=False` throughout — a completely different result from the live run's 0.637-0.648. The same check across all 4 fault types + NORMAL, using a **sustained crossing-rate** metric (not "any single tick," since even NORMAL occasionally spikes above threshold by chance — exactly the ~5% healthy FPR the threshold is calibrated for) gave:

```
MISFIRE                  crossRate=0.057  (offline)   vs. 3/3 = 1.00 (live)
LUBRICATION_DEGRADATION  crossRate=0.057  (offline)   vs. 4/4 = 1.00 (live)
INJECTOR_DEGRADATION     crossRate=0.057  (offline)   vs. 0/15 = 0.00 (live)
SENSOR_DRIFT             crossRate=0.043  (offline)   vs. 0/6 = 0.00 (live)
NORMAL                   crossRate=0.043  (offline)
```

**Conclusion: offline, the anomaly detector cannot separate any of the four fault types from healthy noise (crossing rate ≈ the healthy FPR for all of them) — the model's weak, near-chance separability (AUC~0.59) is real and uniform across fault types, not concentrated in two of them.** The live result — Lubrication/Misfire reliably crossing, Injector/Sensor-Drift never crossing — is **not predicted by the offline-trained model's own held-out evaluation**. It is evidence of a **live/offline feature-distribution gap that is separate from and additional to FINDING-4** (which is already resolved and concerns the classifier's healthy-baseline physics, not the anomaly detector's live rolling-window feature computation). A supporting data point: live NORMAL's own mean score (~0.533) already runs about 0.06 higher than offline NORMAL's mean score (~0.474) — a general live-vs-offline elevation that, combined with each fault's own residual signature, is plausibly enough to tip Lubrication/Misfire over threshold live while Injector/Sensor-Drift's weaker signatures still fall short. The likely mechanism (not root-caused this session — would require a dedicated, FINDING-4-style investigation into how Java's live rolling-window history differs from Python's offline generator, e.g. real per-tick telemetry noise amplitude vs. the offline generator's own noise model) is logged as **FINDING-5** in §8.

#### Phase 4 — Decision

**No threshold value change.** Two independent lines of evidence both point the same way:
1. Offline (the only rigorously reproducible ground truth available): separability is near-chance for every fault type, and the percentile sweep shows no threshold choice buys materially better recall without an unacceptable healthy-FPR cost (e.g. 90th percentile: +10pp recall on average for +10pp FPR; every fault type stays weak).
2. Live: the "reliable" 2-of-4 detection is a distribution-shift artifact the offline evaluation does not support as an inherent model property — tuning the threshold to chase it would be calibrating to unexplained live noise, not genuine model capability. The user's own instruction not to "simply choose a value that makes the demo look good" applies directly here.

**Classification: Correct-but-affected-by-a-live/offline-distribution-mismatch (FINDING-5), compounded by an inherently weak unsupervised model (near-chance AUC).** The anomaly gate's threshold itself is a defensible, near-optimal operating point for the model it is calibrated against; the intermittency users observe live is a product of (a) that inherent weak separability and (b) a live-only elevation in scores for a subset of fault types that isn't yet understood at the component level. If the threshold were lowered to "fix" the live Injector/Sensor-Drift gap, offline evidence says it would mostly just raise the healthy false-positive rate, since the model genuinely cannot separate those two fault types from noise even offline.

#### Changes made this session

1. `physics-service/app/ml/training.py` — corrected the `thresholdSelection` metadata string from "95th percentile of healthy **validation** anomaly scores" to "...**train-split**..." to match what the code has always actually done. **Metadata-only; does not change the threshold value, does not require retraining, and only affects the string written by the *next* training run** (the on-disk `evaluation_metrics.json` from the last training run still carries the old string, since no retrain was performed this session).
2. `physics-service/tests/test_anomaly_detector.py` — **new file, 7 tests**, closing the pre-existing zero-coverage gap:
   - `predict` threshold-boundary inclusivity and above/below separation (deterministic stub model, not brittle to retraining).
   - `fit()` calibrates a healthy false-positive rate within a wide, non-brittle band around the 95%-target (0-15%).
   - A far synthetic outlier scores meaningfully higher than its healthy training cluster and crosses the fitted threshold.
   - Save/load round-trip preserves threshold and predictions exactly.
   - **Real-artifact regression guards** (skip gracefully if no trained artifact present): healthy false-positive rate stays ≤20% on freshly-generated offline NORMAL data; AUC-ROC on a fresh mixed offline set stays ≥0.52 (comfortably below the current ~0.59 but safely above chance) — catches a future retrain becoming *worse* or degenerate without asserting a reliability level (per-fault "detects well") that the offline evidence above shows is not currently true for any single fault type in isolation.
3. **No threshold value changed. No classifier/anomaly hardcoding introduced. No model retrained. No unrelated files touched.**

#### Before vs. After

No behavioral change — this was a diagnosis session with one documentation-string fix. Anomaly-gate behavior live and offline is identical before and after this session's changes; the only "after" is a fully evidenced explanation (this section) plus regression-test coverage that did not exist before.

#### Tests

```
Python (physics-service): pytest -q → 73 collected, 66 passed (59 pre-existing + 7 new in
                           tests/test_anomaly_detector.py), 7 errors — all 7 errors are a
                           pre-existing, environment-only missing xgboost import on
                           test_explainability.py/test_ml_history_integration.py, confirmed
                           unrelated to this session via git stash A/B
                           (UPDATE, later this same session/§15.8: xgboost + shap installed
                           for this environment as routine maintenance — suite is now 73/73
                           passing, 0 errors, no code changes involved)
Java (backend):            not touched this session — no Java files modified
Frontend:                  not touched this session — no frontend files modified
```

#### Remaining Limitations (evidence-backed, not fixed this session)

1. **FINDING-5 (new, P1): live anomaly-score distribution for Lubrication Degradation and Misfire runs meaningfully higher than the offline-trained model predicts for the same severity/onset parameters** — not root-caused to a specific component this session (candidate mechanism: live rolling-window/history noise characteristics differ from the offline generator's, analogous in spirit to FINDING-4 but for the ML feature pipeline rather than physics). This is why the gate looks "reliable" for 2 of 4 faults live despite offline evidence showing near-chance separability for all 4 — a real, quantified, and now explicitly tracked gap, not an unexplained mystery.
2. The anomaly detector's offline separability (AUC~0.59) remains inherently weak for all four fault types — this is a model-class limitation (unsupervised Isolation Forest vs. the supervised, purpose-optimized XGBoost classifier), not a bug, and improving it would require model/feature-engineering work explicitly out of scope for a same-session fix.
3. Sensor Drift's non-detection is expected and unchanged from every prior session's documented finding (§15.3/§15.6) — not part of this session's open items.
4. The `training.py` metadata-string fix only takes effect on the *next* training run; the currently-shipped `evaluation_metrics.json` still carries the old (incorrect) label until a retrain happens.

### 15.8 FINDING-5 Investigation — Root Cause Identified (session 8 continued, 2026-09-10)

**Status: root cause identified with direct, controlled, feature-level evidence. Not fixed — this was an investigation, per explicit instruction. Threshold NOT changed. Classifier, fault models, health/degradation/RUL, mission logic, and frontend NOT touched.**

**Objective:** determine exactly why live Lubrication Degradation and Misfire anomaly scores diverge from offline-generated scores for the same scenario (§15.7/FINDING-5), tracing the full pipeline (telemetry → history → rolling window → features → Isolation Forest → score → threshold) rather than stopping at "distribution shift."

#### Phase 1 — Pipeline trace

`build_live_features()` (`app/features/feature_engineering.py`) calls the *exact same* `build_features()` function training uses — there is no separate live feature-computation code path. This means the divergence cannot be in feature-computation logic; it must be in the **data fed into that shared function**: the `sample` dict (current telemetry/prediction/residuals) and the `history` list Java sends. Two structural facts, confirmed by direct code reading:

1. **`SimulationService`'s 1Hz scheduler and `DiagnosticService`'s history buffer are decoupled.** `TelemetryWebSocketHandler` runs `simulationService.tick()` unconditionally at 1Hz (`scheduleAtFixedRate(..., 1, 1, TimeUnit.SECONDS)`) — this is the *only* scheduled job in the codebase. But `DiagnosticService.getCurrentDiagnostics()` — the *only* place that builds the `history` deque (`history.addLast(complete)`) and calls `mlServiceClient.analyze()` — runs **synchronously once per REST hit** to `/api/diagnostics/current` (or `/api/health|degradation|rul/current`), not on any schedule. The model's `temporal_window=5` rolling-window features (`_temporal_features` in `feature_engineering.py`) and the offline generator's `sample_rate_hz=1.0` (`DatasetConfig`) both assume **exactly 1-second-spaced samples** — "5 samples" is designed to mean "5 seconds of context." Live, "5 samples" means "the last 5 times a client happened to poll," which is unbounded and client-controlled.
2. **`missionPhase` is a one-hot feature (`MISSION_PHASES = ("IDLE","TAKEOFF","CLIMB","CRUISE","LOITER","DESCENT","LANDING")`, `feature_schema.py`), but `mission_generator.profile_for_seed()` — the offline generator's only source of mission phase — only ever produces TAKEOFF/CLIMB/CRUISE/LOITER/DESCENT/LANDING. `IDLE` never appears in any training row.** Live, `SimulationState`'s mission phase is permanently `IDLE` (no code path ever calls `setMissionPhase()`, already noted in FINDING-4's investigation for the classifier, but not previously checked against the anomaly detector). So `missionPhase_IDLE` is `0` for 100% of training data and `1` for 100% of live data — an always-out-of-distribution categorical feature, present on every single live sample regardless of fault state.

#### Phase 2/3 — Matched live/offline data, decisive experiment

**A temporary, removable diagnostic instrument was added** (per the task's explicit allowance) to `app/ml/inference.py`'s `analyze()` — an env-var-gated dump of the exact named feature vector fed to the Isolation Forest — then **fully removed after evidence collection, confirmed via `git diff` showing zero residual change to the file.**

The decisive test: **poll `/api/diagnostics/current` at true 1Hz — matching the offline generator's own `sample_rate_hz=1.0` — through a Lubrication Degradation onset, instead of the ~12-13s ad hoc cadence session 8's first pass used.**

```
Lubrication Degradation, severity 0.9, fixed onset=120s:
  12-13s poll cadence (original §15.7 evidence): steady post-onset score 0.637-0.648, anomaly=True 4/4
  1Hz poll cadence (this phase):
    t=110-119 (pre-onset):        0.529-0.542, anomaly=False   (matches offline pre-onset closely)
    t=120-123 (onset transient):  0.628-0.644, anomaly=True    (window still straddles the boundary)
    t=124-189 (clean 1Hz window): 0.60-0.61,   anomaly=False almost throughout — RIGHT AT the
                                   0.6124 threshold, NOT the persistent 0.637-0.648 the 12-13s
                                   cadence produced for the identical scenario/severity/onset
```

**This is a controlled, single-variable result: only the polling cadence changed, and the steady-state score dropped by ~0.03-0.05, converting a reliably-crossing case into a borderline one.** Poll-cadence-driven history sampling is confirmed as a real, causally-demonstrated contributor — not the only one (see Phase 5).

**Controls, same 1Hz protocol:**

| Scenario | Onset transient (t=120-123) | Steady 1Hz plateau (t=124-189) | vs. earlier 12-13s cadence |
|---|---|---|---|
| Injector Degradation | 0.566-0.584 (below threshold) | 0.55-0.56 | Same shape, same conclusion (never crosses) — cadence-insensitive |
| Misfire | 0.615-0.635 (crosses) | Noisy, ~31% crossing rate over t=124-189 | Much closer to offline's own 23.5% high-severity crossing rate than the earlier 12-13s run's 3/3=100% |
| Sensor Drift | No transient at all (0.535-0.543) | 0.54, flat | Matches earlier cadence and offline — unaffected, as expected (this fault's model grows unboundedly with elapsed time, not a step onset, so there is no boundary to straddle) |

Misfire's result is a genuine, useful nuance: its fault model (`fault_models.py`) is the *only* one that uses `rng.random()` for a per-tick probabilistic event pattern — so even at correct 1Hz cadence, its rolling-window variance stays real and elevated (not a cadence artifact), landing much closer to its own offline crossing rate than Lubrication does. Sensor Drift's complete absence of an onset transient, even at 1Hz, is consistent with its fault model's documented unbounded-linear-growth design (no step to straddle) — confirming the transient-spike mechanism specifically requires a step-like onset, which only Injector/Lubrication/Misfire have (via `fixed_severity`).

#### Phase 4/5 — Residual and feature-level comparison (the "actual mechanism," not hand-waved)

Residuals themselves are not the problem — FINDING-4 already proved exact physics equivalence to 6 decimal places for context-driven channels, and this session's own residual snapshots (e.g. live `rpmResidual=-47.9`, offline matched-severity `rpmResidual=-44.6`) confirm residual sign/magnitude stay close. **The divergence is downstream, in the rolling-window features — and it has an identified, concrete cause, not just "the numbers are bigger":**

```
Live PRE-ONSET (t=100, NORMAL) vs. offline matched-mission pre-onset row — rolling features:
  rpm_rollingStd_5      live=0.0000   offline=28.386   egt_rollingStd_5   live=0.0000  offline=3.814
  fuelFlow_rollingStd_5 live=0.0000   offline=0.106    oilPressure_rollingStd_5 live=0.0000 offline=1.419
  (slope_5 features: live exactly 0.0000 for all four; offline non-zero)
```

**Root mechanism: since FINDING-4's fix (session 7), live's context-driven channels (rpm/egt/fuelFlow/oilPressure) are pure deterministic functions of a permanently fixed operating point (`altitude=0, throttle=0.8, load=0.7, ambientTemperature=15`, set once in `SimulationService`'s constructor and never changed) via `/physics/predict`. A deterministic function of unchanging inputs returns bit-identical output every tick — so live's rolling std/slope for these channels is *exactly* zero, every single tick, healthy or not.** The offline generator, by contrast, injects real per-tick measurement-style noise into these same channels even during healthy operation (confirmed: offline `rpm_rollingStd_5` ≈ 28 pre-onset, never zero) — which is what the model's rolling-window features were actually trained against. An Isolation Forest trained on "small but non-zero" values for these features, seeing a live value of *exactly* 0.0 on every sample, is presented with a value outside (or at the extreme edge of) what it learned — on every single live tick, not just during faults. **This also sharpens the onset-transient spike**: live's baseline is a perfectly flat line, so any fault onset is a maximally sharp discontinuity for the rolling window to straddle, more extreme than offline's noisy-to-noisier transition.

**A third, independent, structural contributor, confirmed directly from source (not inferred): `missionPhase_IDLE` is `1` for literally every live sample and `0` for literally every training row** (Phase 1 above) — a small, constant, fault-independent contribution present on every live tick.

**None of these three mechanisms is "the threshold is wrong."** All three are upstream of the Isolation Forest, in how live data is generated/sampled relative to what the offline-trained model actually learned.

#### Phase 6 — Which representation is canonical?

- **Poll-driven history sampling vs. fixed 1Hz:** the model's own `temporal_window=5` design and the offline generator's `sample_rate_hz=1.0` are both explicit, intentional design choices meaning "5 seconds of context." Nothing in the codebase or prior master-file sessions documents "sample the rolling window once per client poll" as an intentional design — it is an unaddressed architectural gap between `DiagnosticService`'s poll-driven history construction and the already-existing 1Hz `SimulationService` scheduler. **The offline/model assumption (fixed 1Hz) is canonical; live's poll-driven behavior is the gap.**
- **Zero pre-fault noise in live context-driven channels:** a real engine's telemetry would never be bit-identical tick to tick — sensor noise, quantization, and minor coupled fluctuation are physically inevitable. Live's current perfectly-flat behavior is a **side effect** of FINDING-4's fix (which correctly zeroed out the *baseline residual gap*, but as a side effect also zeroed out ordinary per-tick variance, since `/physics/predict` is queried at one permanently fixed operating point with no measurement-noise layer). **The offline generator's noise injection is the more physically realistic representation; live's current zero-noise behavior is the artifact**, not something to preserve.
- **`missionPhase` permanently `IDLE`:** every mission-related system in this codebase (offline generator, mission simulation, what-if) treats mission phase as a first-class, varying input. Live never varying it is a known, already-documented gap (referenced in FINDING-4's own investigation) — not an intentional design choice.

**On all three points, the offline/training assumptions are the scientifically correct reference; live's implementation has simply never been built to match them for these specific properties** (as distinct from FINDING-4's healthy-baseline *residual* fix, which live already correctly matches).

#### Phase 7 — Architecture options considered

- **Option A (bring live in line with training assumptions) — recommended, but only for the history-cadence gap.** Make `DiagnosticService`'s history buffer populate on the existing 1Hz `SimulationService` scheduler instead of on REST-poll timing. This is a targeted, low-blast-radius fix: it does not touch the classifier, fault models, health/degradation/RUL, or the threshold — it only changes *when* a diagnostic snapshot is appended to `history`, which is exactly the property the model's `temporal_window` design already assumes. This is the single highest-leverage fix identified: it has the largest, most causally-demonstrated effect size of the three mechanisms (converted a persistent 100%-crossing case to a borderline threshold case in a controlled A/B test).
- **Option B (change the offline generator to match live)** — rejected. Removing offline's noise injection or forcing `missionPhase="IDLE"` into training data would make the *training data* less realistic to chase an artifact of live's current implementation, exactly the "make live look right by breaking what's correct" pattern the task warned against.
- **Option C (make the feature pipeline robust to both distributions)** — partially already true (the pipeline is literally the same function); the robustness gap is in the *inputs*, not the transformation logic, so this option collapses into fixing the inputs (poll cadence, noise, mission phase), i.e., Option A applied to each.
- **Option D (retrain/recalibrate using live-style telemetry)** — not recommended now. It would paper over the poll-cadence bug (retraining on inconsistent-cadence data doesn't fix the fact that live cadence is still uncontrolled and client-dependent) and would need real per-tick sensor noise and mission-phase cycling in the live simulator first to generate representative training data — premature before those are addressed.
- **Option E (document as acceptable, no change)** — appropriate for the noise-model and mission-phase gaps *this session*, since fixing them (adding a realistic measurement-noise layer to `HealthyEngineSimulator`, wiring live mission-phase cycling into `SimulationState`) are each non-trivial changes with broader blast radius (could affect health/degradation/RUL trend logic, which currently assumes context-driven channels are stable) — legitimately out of scope for a same-session fix, unlike the cadence issue.

#### Recommended solution

**Fix the history-buffer sampling cadence (Option A, scoped narrowly): make `DiagnosticService` append to `history` on the existing 1Hz `SimulationService` schedule, not on REST-poll timing.** This is the one mechanism with a clean, well-scoped, low-risk fix that doesn't touch ML models, fault semantics, or the threshold, and it has the largest demonstrated effect size. The zero-noise and permanent-`IDLE`-phase gaps are documented as real, understood, secondary contributors — appropriate for a dedicated future session (each touches `SimulationState`/`HealthyEngineSimulator`, which other systems depend on).

**Not implemented this session** — per explicit instruction, this investigation identifies and evidences the fix; it does not apply it.

#### Implementation scope (for the next session, not applied now)

- Likely involved: `backend/src/main/java/com/aerotwin/service/DiagnosticService.java` (move history-buffer population off the REST-request path onto a scheduled tick), `backend/src/main/java/com/aerotwin/controller/TelemetryWebSocketHandler.java` or a new dedicated scheduler (to drive the diagnostic pipeline at 1Hz independent of whether any REST client is polling), and the four controllers that currently call `getCurrentDiagnostics()` synchronously (`DiagnosticController`, `HealthController`, `DegradationController`, `RulController`) would need to read the latest computed snapshot instead of triggering computation themselves.
- Must NOT change: the anomaly threshold, `AnomalyDetector`/`FaultClassifier` code, fault models (`fault_models.py`), health/degradation/RUL calculators, mission logic, the frontend, or `build_features`/`build_live_features`'s transformation logic itself.
- Secondary, not scoped for that fix: any change to `HealthyEngineSimulator`'s noise model or `SimulationState`'s mission-phase handling — those are FINDING-5-adjacent but architecturally separate follow-ups (documented, not actioned).

#### What must NOT change (this session, honored)

Anomaly threshold (0.6124, unchanged) · `AnomalyDetector`/`FaultClassifier` (unchanged) · fault models/fault semantics (unchanged) · health/degradation/RUL/mission logic (unchanged) · frontend (unchanged, no frontend files exist in this repo state touched) · `/api/simulator/fault` fault-selection API (unchanged). The only file touched and left changed is the previously-reported `training.py` metadata-string fix from §15.7 (unrelated to FINDING-5) and this session's new test file; the temporary `inference.py` debug instrument was added and fully removed (`git diff` confirms zero residual change).

#### Verification plan (for whoever implements the recommended fix)

1. Before/after A-B test: with the fix applied, repeat this session's exact 1Hz Lubrication/Misfire/Injector/Sensor-Drift protocol and confirm scores no longer depend on client poll frequency (poll at 1Hz and at a slow ad hoc cadence, e.g. 12-13s, and confirm both now match the model's fixed-cadence assumption instead of diverging).
2. Confirm `history` length and inter-sample spacing are now consistent regardless of how often `/api/diagnostics/current` is polled.
3. Re-run the offline vs. live matched-parameter comparison from §15.7/§15.8 (same severity, same onset) and confirm the gap between live and offline steady-state scores narrows further.
4. Full Java/Python/frontend regression suites, plus the existing `tests/test_anomaly_detector.py` regression tests (§15.7) must still pass unmodified (they test the model in isolation, not the history-sampling architecture, so they are not expected to need changes).
5. Do not declare FINDING-5 fully resolved until the residual gap (live steady-state vs. offline steady-state) has narrowed to something defensible — the noise-model and mission-phase contributors will likely still leave a smaller, secondary gap, which should be re-evaluated (not assumed away) once the cadence fix lands.

#### Environment note (unrelated to FINDING-5, fixed as routine environment maintenance)

`xgboost` and `shap` were missing from the native Windows Python interpreter this session started with, causing 7 pre-existing test errors (already documented in §15.7 as pre-existing/environment-only). Both were installed this session (`pip install xgboost shap`) — with them present, the full Python suite is **73/73 passing, 0 errors** (was 66/73 passing, 7 errors). This is an environment fix, not a code change — no source files were touched to achieve this.

### 15.9 FINDING-5 Implementation — History-Cadence Fix (session 8 continued, 2026-09-10)

**Status: RESOLVED for the primary, largest-effect contributor (poll-driven history sampling). Two smaller, secondary contributors (zero live telemetry noise, permanent `missionPhase="IDLE"`) remain, documented, not part of this fix — FINDING-5 is not being claimed as fully eliminated.**

#### Architecture implemented

**Before:** `DiagnosticService.getCurrentDiagnostics()` computed a fresh diagnostic snapshot and appended it to the ML `history` deque *every time it was called* — and it was called directly by `DiagnosticController`, `HealthController`, `DegradationController`, and `RulController` on every REST hit. History cadence was therefore whatever rate REST clients happened to poll at.

**After:** the tick/read responsibilities are split, mirroring `SimulationService`'s own established `tick()`/`getLatestTelemetry()` pattern:
- **`DiagnosticService.tick()`** (new) — computes the full diagnostic snapshot (telemetry → ML analysis → health → degradation/RUL) and is the *only* method that appends to `history`. Called from `TelemetryWebSocketHandler.broadcastTelemetry()`, right after `simulationService.tick()`, on the existing 1Hz `ScheduledExecutorService` — the same clock that already advances the live simulation, now unconditionally (regardless of whether any WebSocket client is connected, matching the existing "tick the simulation anyway to keep state moving forward" behavior).
- **`DiagnosticService.getCurrentDiagnostics()`** (rewritten) — now purely read-only. Returns the cached snapshot from the most recent `tick()`, bootstrapping via one `tick()` call only if called before the scheduler has ever ticked (mirroring `SimulationService.getLatestTelemetry()`'s identical bootstrap pattern). Never mutates `history`. Any number of REST clients, at any polling rate, get back the same cached value between ticks.
- **503 propagation preserved exactly.** `tick()` catches the four downstream-unavailable exception types (`PhysicsServiceUnavailableException`, `MLServiceUnavailableException`, `HealthServiceUnavailableException`, `DegradationServiceUnavailableException`) internally — mirroring `SimulationService.tick()`'s established "never let the scheduler die" pattern — and stores the failure. `getCurrentDiagnostics()` re-throws the *same stored exception object* (same type, same partial-snapshot payload the four controllers already know how to catch and map to 503), so controller behavior is byte-for-byte unchanged; only *when* the exception is thrown changed (from a scheduler tick instead of the REST thread), not its type or content.
- **Thread safety improved as a side effect, not a redesign.** `history` mutation (`tick()`, `resetHistory()`) is now wrapped in `synchronized(history)` blocks. Previously, multiple concurrent REST threads calling `getCurrentDiagnostics()` could race on the same unsynchronized `ArrayDeque`; now only the single-threaded scheduler and `resetHistory()` (called from `SimulatorController`) ever touch it, and the synchronized blocks make that safe.

#### Files Changed

- `backend/src/main/java/com/aerotwin/service/DiagnosticService.java` — split into `tick()` (computes + appends, catches downstream failures) and `getCurrentDiagnostics()` (read-only, bootstraps once, re-throws stored failures); `resetHistory()` synchronized; added `AtomicReference<DiagnosticSnapshot> latestDiagnostics` and `AtomicReference<RuntimeException> lastTickFailure`.
- `backend/src/main/java/com/aerotwin/controller/TelemetryWebSocketHandler.java` — constructor now also takes `DiagnosticService`; `broadcastTelemetry()` calls `diagnosticService.tick()` right after `simulationService.tick()`, unconditionally, before the WS-session-empty check (minor simplification: the duplicate `simulationService.tick()` call in both branches was consolidated into one call at the top).
- `backend/src/test/java/com/aerotwin/service/DiagnosticServiceTest.java` — rewritten: the 3 existing tests now call `tick()` instead of `getCurrentDiagnostics()` to grow history (same assertions, correct method); 4 new tests added (below).
- **Not changed:** `WebSocketConfig.java` (Spring autowires the new constructor parameter automatically — `TelemetryWebSocketHandler` is already a `@Component`), any controller (`DiagnosticController`/`HealthController`/`DegradationController`/`RulController` call sites and catch blocks are untouched — they still call `diagnosticService.getCurrentDiagnostics()` exactly as before), `SimulatorController` (still calls `resetHistory()` unchanged), any Python file, the anomaly threshold, `AnomalyDetector`/`FaultClassifier`, fault models, health/degradation/RUL calculators, mission logic, or the frontend.

#### History Cadence (Test 1)

Measured via a temporary, removable instrument in `app/ml/inference.py` (dumping each `/ml/analyze` call's arrival time and history length to a file; added, used, then fully removed — confirmed via `git diff` showing zero residual change). Backend left running **untouched, zero REST polling**, for two separate windows:

```
Clean capture (no REST reads during the window):
  101 samples over 100.01s elapsed
  mean interval = 1.0001s   min = 0.9519s   max = 1.0510s
  historyLen sequence: grows by exactly +1 per tick, capped correctly at 60
  chronological ordering: confirmed (each tick's history ends with the immediately
  prior tick's own sample, verified instant-for-instant)
```

Well within any reasonable tolerance of the intended 1 sample/second.

#### Poll Independence (Test 2, Test 8)

A single script hit `/api/diagnostics/current` in four patterns over ~49s: ~1 req/s (15 polls), ~5 req/s (50 polls), ~0.1 req/s (2 polls), and 3 bursts of 10 concurrent simultaneous clients (30 polls) — **97 REST polls total, 0 errors.** Simultaneously, the scheduler-driven `/ml/analyze` call log showed:

```
77 actual diagnostic ticks over 76.00s elapsed
mean interval = 1.0000s   min = 0.9775s   max = 1.0188s
historyLen still grows by exactly +1 per tick — completely unaffected by 97 REST
polls at four different rates, including concurrent multi-client bursts
```

**This is direct, decisive evidence for both Test 2 and Test 8**: REST polling — at any rate, including a 5x-real-time burst and concurrent clients — has zero effect on history growth or cadence. It is now purely scheduler-driven, exactly as intended.

#### NORMAL (Test 3)

`POST /api/simulator/fault {"faultType":"NORMAL"}` → `GET /api/twin/current`: all 7 residual channels and all 7 normalized-residual channels exactly `0.0000`. `GET /api/diagnostics/current`: `anomalyScore=0.5458`, `anomaly=false`, `predictedFault=NORMAL` — healthy, no false positive, consistent with the ~0.53 baseline established throughout this session's testing (a small residual live-vs-offline baseline gap, ~0.53 vs ~0.47, remains — see "Remaining Contributors" below, unrelated to this fix).

#### Lubrication (Test 4) — the headline result

```
                          12-13s (slow) cadence         1Hz cadence
Before this fix:          0.637 / 0.648 / persistent    0.628-0.644 transient, then 0.60-0.61
                           anomaly=True on 4/4 samples    (already close to correct by
                                                            coincidence of matching cadence)
After this fix:           0.6076 / 0.6017 / 0.6056 /     0.6376-0.6490 transient (t=120-123),
                           0.6037 (t=124-161s)             then 0.60-0.61 steady (t=124-189s)
                           anomaly=False throughout        anomaly=False almost throughout
```

**Slow (12-13s) cadence now produces the same result as 1Hz cadence** — a complete reversal from before the fix, where the two cadences diverged by ~0.03-0.05 (persistent-crossing vs. borderline). This is the direct, causal proof the fix works: the score no longer depends on how the client happens to poll. Per the explicit instruction, **this was not required to cross or not cross the threshold** — the goal was reproducible temporal behavior regardless of poll rate, which is what was measured and confirmed. That the converged value (~0.60-0.61) sits close to but just under the 0.6124 threshold is the honest, unmanipulated result of the real fix — not a target that was engineered.

#### Misfire (Test 5)

1Hz post-fix, 70 post-onset samples: **23/70 ≈ 32.9% crossing rate**, classifier confidence 96.8-97.9% throughout. Consistent with the pre-fix 1Hz result (~31%, 22/70) — as expected, since Misfire's fault model has its own designed-in per-tick probabilistic event pattern (the only fault model using `rng.random()`), so its behavior was already governed by its own randomness rather than by poll cadence, both before and after this fix. Per the explicit instruction, no exact percentage was required or engineered.

#### Injector (Test 6)

1Hz post-fix, 160s: residual signature unchanged (previously confirmed sign/magnitude match to offline training, FINDING-4), classifier confidence steady 97.8%, anomaly score plateaus 0.55-0.56 — never crosses 0.6124, unchanged from every prior measurement at any cadence. No regression.

#### Sensor Drift (Test 7)

1Hz post-fix, 160s: classifier confidence steady 97.9%, anomaly score plateaus ~0.54 — never crosses. Sensor-isolation gap (FINDING-3) untouched and not attempted — out of scope for this task, as instructed.

#### Regression Tests

`backend/src/test/java/com/aerotwin/service/DiagnosticServiceTest.java` — 7 tests (3 rewritten to call `tick()`, 4 new):
- `firstTickSendsEmptyHistoryToEveryDownstreamService` — one history append per tick, insufficient-history (empty) behavior on the very first tick.
- `mlHistoryNeverIncludesTheCurrentTickBeingAnalyzed` — chronological, non-self-referential history growth across 3 ticks.
- `resetHistoryClearsWhatFutureTicksSendAsHistory` — existing reset semantics preserved exactly.
- **`readingCurrentDiagnosticsRepeatedlyNeverMutatesHistoryOrRecomputes`** (new) — the direct regression guard for "zero history append from REST reads": ticks once, reads 10 times, asserts `mlServiceClient.analyze()`/`healthServiceClient.evaluate()`/`degradationServiceClient.evaluate()` were each called exactly once (not 11 times), and that a subsequent tick still sees exactly 1 prior sample, not 11.
- **`getCurrentDiagnosticsBootstrapsExactlyOnceWhenCalledBeforeAnyTick`** (new) — cold-start behavior: calling the read method before any tick computes once, then caches; a second call does not recompute.
- **`tickFailureDoesNotAppendHistoryAndIsRethrownByTheNextRead`** (new) — a failed tick appends nothing to history, does not call downstream health/degradation (fail-fast), and the exact same exception object is re-thrown by the next read (preserving existing 503 payload contracts).
- **`serviceRecoversOnTheNextSuccessfulTickAfterAFailure`** (new) — automatic recovery once a subsequent tick succeeds, no manual intervention required, matching the established resilience pattern from FINDING-4's fallback design.

#### Tests

```
Java (backend):  mvnw test → 52/52 PASS, BUILD SUCCESS (45 pre-existing/session-7-baseline
                 + 7 in the rewritten DiagnosticServiceTest, 4 of which are new)
Python (physics-service): pytest -q → 73/73 PASS, unchanged (temporary debug instrument
                 added and fully removed, git diff confirms zero residual change)
Frontend: npm run build → PASS, 0 errors (no frontend files touched)
Live regression sweep: all 4 fault scenarios + NORMAL re-verified live post-fix (above);
                 simulator reset to NORMAL after all testing
```

#### FINDING-5 Status

**PARTIALLY RESOLVED.** The primary, largest-effect, causally-demonstrated contributor — REST-poll-driven (not fixed-1Hz) history sampling — is fixed and verified: history cadence is now demonstrably scheduler-driven (Test 1), REST polling at any rate no longer mutates or affects history (Test 2/8), and the live/offline discrepancy attributable to cadence is resolved for Lubrication (slow and fast cadence now converge to the same ~0.60-0.61 result, matching the already-established 1Hz/offline-adjacent behavior). **Two secondary contributors identified in §15.8 remain, explicitly not addressed by this fix, and FINDING-5 is not being marked fully resolved:**
1. Live context-driven telemetry channels (rpm/egt/fuelFlow/oilPressure) still have exactly-zero per-tick noise (a side effect of FINDING-4's fix), vs. offline's real injected noise on the same channels — this is why Lubrication's converged live score (~0.60-0.61) still sits somewhat above the offline matched-scenario score (~0.49-0.57) even with cadence now correct.
2. `missionPhase_IDLE` remains permanently `1` live, `0` in 100% of training data.

Both are documented, real, evidenced contributors to the residual gap — kept as open, separate, out-of-scope-for-this-task items per the explicit instruction not to expand this task into retraining or redesigning mission phases.

#### Remaining Contributors (not fixed this task, tracked separately)

See §17 P2 items: live per-tick telemetry noise (needs a measurement-noise layer in `HealthyEngineSimulator`, touches health/degradation/RUL trend assumptions — its own scoped session) and permanent `missionPhase="IDLE"` (needs live mission-phase cycling wired into `SimulationState`, same live-simulator surface).

### 15.10 FINDING-5 Secondary Contributors — Quantified and Closed as Document-Only (overnight sprint, 2026-09-10)

**Status: DOCUMENTED / ACCEPTED LIMITATION for both.** Investigated with isolated, controlled ablation experiments against the real trained `AnomalyDetector`, not live polling (which cannot cleanly separate confounded mechanisms). Both confirmed real but **not material** to the demo or to the residual live/offline gap.

**Method:** rather than re-running live experiments (which always confound multiple mechanisms), each contributor was tested in isolation by taking one real, matched offline feature row (`generate_records` → `build_features`, `fixed_severity=0.9`, well past onset) and modifying *only* the columns each contributor concerns, then re-scoring with the real trained detector (`AnomalyDetector.score()`), holding everything else — including the other contributor — fixed. This directly measures each mechanism's own marginal effect size, something no live measurement in §15.7-§15.9 could do.

**Contributor A — zero live telemetry noise:** zeroing `rpm_rollingStd_5`/`slope_5`, `egt_rollingStd_5`/`slope_5`, `fuelFlow_rollingStd_5`/`slope_5`, `oilPressure_rollingStd_5`/`slope_5` (exactly the 8 columns confirmed zero live in §15.8) on an otherwise-realistic offline row changed the score by **-0.0035 to +0.0094** across NORMAL + all 4 faults (6 seeds tested for Lubrication specifically: +0.0035 to +0.0090) — negligible, an order of magnitude smaller than the ~0.03-0.05 cadence effect FINDING-5's primary fix addressed.

**Contributor B — permanent `missionPhase="IDLE"`:** cycling a real offline row through all 7 possible `missionPhase` one-hot settings (Lubrication, Injector) showed the *full range* across all phases is only **~0.027-0.028** (e.g. Lubrication: 0.5002 IDLE to 0.5282 LOITER). **`IDLE` specifically scored at or near the *low* end in both fault types tested — not elevated.** Live's permanent `IDLE` phase is not inflating anomaly scores; if anything it works slightly against a crossing, not for one.

**Honest remaining gap:** neither contributor, alone or combined, explains the ~0.09-0.12 gap that persists between live's post-cadence-fix Lubrication steady-state (~0.60-0.61) and the offline matched-scenario steady-state (~0.49-0.57). **This is flagged as a genuinely open, not-yet-identified factor** — not conflated with contributors A/B, and not pursued further this sprint (would require another dedicated investigation in the spirit of FINDING-4/FINDING-5, out of scope for "do not chase perfect ML numbers").

**Decision for both: C (document only).** Per the explicit instruction ("if neither materially harms the SIH demonstration, prefer B or C"): both are quantified as small (≤0.01 and ≤0.03 respectively), fixing either would touch `HealthyEngineSimulator`/`SimulationState` (which health/degradation/RUL trend logic depends on) for a benefit this experiment shows is negligible, and Contributor B's effect direction (IDLE trends low) means "fixing" it could not be justified as improving demo reliability even in principle. **No code changed for either contributor.**

### 15.11 Overnight Sprint — Demo Hardening + Final SIH Validation (2026-09-10)

**Objective:** after FINDING-5's Workstream 1 (§15.10), make the existing end-to-end system more demo-robust — no new features, no ML redesign, fix only concrete bugs found by evidence, full release-style validation.

#### Environment correction (not a bug, worth recording)

Discovered `physics-service/.venv/` already exists, fully provisioned (`fastapi`, `uvicorn`, `xgboost`, `shap`, **`scikit-learn 1.9.0`** — matching the trained artifacts' version exactly, unlike the native Windows interpreter's 1.8.0, which is why every earlier session saw `InconsistentVersionWarning` on every model load). All of this session's live/test work from this point on used `.venv/Scripts/python.exe`, matching the actual repo convention (`git status` confirms `.venv/` is gitignored, was always present, was simply not used in sessions 1-8). `pytest -q` via `.venv`: **74/74 passing, 1 harmless deprecation warning, zero version-mismatch warnings** — cleaner than every prior session's result. The master file's older "use the native Windows Python" environment note (§25) is now superseded — see the correction below.

#### Bug found and fixed #1 — BUG-3 (WS timestamp serialization), now resolved

**Symptom:** `TelemetryWebSocketHandler` constructed its own `ObjectMapper` instead of using Spring's autoconfigured bean, so WS frames serialized `timestamp` as a raw epoch-seconds float (`1788990505.684044600`, `typeof number`) instead of ISO-8601 (`"2026-09-09T21:48:00.68...Z"`, matching every REST endpoint). Documented as an open P3 item since session 2, never fixed. Re-confirmed present via a real Node `ws` client this session before touching anything.

**Investigated before fixing, per the explicit "trivial and isolated only" instruction:** `grep -rn "\.timestamp\b" frontend/src/` → zero matches — the frontend has never read this field. Fixing it cannot regress the frontend. The fix touches exactly one file, uses an already-established pattern (`MLServiceClient` and every REST controller already receive the Spring-managed `ObjectMapper` via constructor injection) — trivial and isolated, as the task explicitly authorized without asking.

**Fix:** `TelemetryWebSocketHandler`'s constructor now takes `ObjectMapper` as a Spring-injected parameter instead of `new ObjectMapper() + registerModule(new JavaTimeModule())`. No other class touched; no ambiguous-bean risk (confirmed no competing `ObjectMapper` `@Bean` exists anywhere in the codebase).

**Verification:** live re-test with the same Node `ws` client — 4 consecutive frames, `timestamp: "2026-09-09T21:49:46.737629300Z"` (`typeof string`), ISO-8601, matching REST exactly. `mvnw test` 52/52 unaffected.

#### Bug found and fixed #2 — sensor-isolation false-positive on physical faults (new finding, not previously documented)

**Symptom, found live during Workstream 3's fault-sequence validation:** activating `INJECTOR_DEGRADATION` (severity 0.9, past onset) produced `health.diagnosticType = "SENSOR_FAULT"`, `affectedSensor = "fuelFlow"` — even though the real trained classifier's own `faultProbabilities.INJECTOR_DEGRADATION = 0.978`. The dashboard's `AlertBanner` would have shown *"Sensor fault isolated on fuelFlow — physical engine health unaffected"* for what is actually a confidently-identified physical fault. The same misattribution reproduced for `MISFIRE` (`affectedSensor="vibration"`).

**Root cause, traced precisely:** `health_calculator.evaluate_health()`'s sensor-isolation gate computed `model_supports_sensor_fault = predictedFault in {"NORMAL", "SENSOR_DRIFT"}`. But `predictedFault` is *itself* gated by the separate anomaly-score threshold (`predicted_fault = labels[0] if is_anomaly else "NORMAL"`, `inference.py`) — and per FINDING-5's own findings, Injector's and Misfire's anomaly gate crosses only intermittently even though the classifier is 97-98% confident underneath. So whenever the anomaly gate happened not to cross on a given tick, `predictedFault` defaulted to `"NORMAL"`, which the isolation gate misread as "the model itself thinks this might be a sensor issue" — a category error: `predictedFault="NORMAL"` sometimes means "genuinely healthy" and sometimes means "anomaly-gate-suppressed but the classifier knows exactly what fault this is," and the isolation gate could not tell these apart.

**Fix:** use the classifier's own raw top-probability class (`argmax(faultProbabilities)`, already computed and already sent every tick, unaffected by the anomaly gate) for the `model_supports_sensor_fault` check, instead of the anomaly-gated `predictedFault`. `model_fault` itself (used for `fault_type` in the `PHYSICAL_FAULT` branch) is untouched.

**Why this is the smallest safe fix, not a sensor-isolation redesign:** it does not touch the actual multi-channel isolation heuristic (`_sensor_health()`'s `magnitude`/`persistence`/`related_magnitude` logic — FINDING-3's real, still-open root cause, untouched). It does not touch `_subsystem_scores()`, which is called with `affected_sensor` **independent of this final label decision** — meaning health/degradation/RUL **numeric scores are provably unaffected**, only the `diagnosticType`/`affectedSensor`/`faultType` *labels* change. It can only make the system *more conservative* (fewer false "sensor fault" claims) — the `PHYSICAL_FAULT` branch still requires `anomaly=True` regardless of this change, so nothing new can be fabricated. No threshold, classifier, fault model, or ML architecture touched.

**Regression test:** `test_anomaly_gate_suppressed_physical_fault_is_not_misattributed_as_sensor_fault` (`tests/test_health.py`) constructs exactly the reproducing scenario (`anomaly=False`, `predictedFault="NORMAL"`, `faultProbabilities` confident in a physical fault) — **confirmed to fail on the pre-fix code** (`git stash` A/B: fails with `diagnosticType='SENSOR_FAULT', affectedSensor='fuelFlow'`, the exact live symptom) and pass post-fix, so this is a verified, non-vacuous regression guard, not a test written to trivially pass.

**Live re-verification post-fix, fresh service restart:**
```
Injector Degradation  (t=135s): diagnosticType=NORMAL (was SENSOR_FAULT)  faultProbabilities.INJECTOR_DEGRADATION=0.978 (untouched)
Misfire, 10 samples across onset: 0/10 SENSOR_FAULT (was misattributed); alternates correctly between
                                    PHYSICAL_FAULT/MISFIRE (3/10, when anomaly crosses) and NORMAL (7/10)
Lubrication Degradation (t=135s): diagnosticType=NORMAL — UNCHANGED, matches pre-fix behavior exactly
Sensor Drift (t=135s):            diagnosticType=NORMAL — UNCHANGED, FINDING-3's gap reproduces exactly
                                    as before, confirming this fix does NOT touch FINDING-3 at all
```

**Files:** `physics-service/app/health/health_calculator.py` (12 lines), `physics-service/tests/test_health.py` (+33 lines, 1 new test).

#### Bug found and fixed #3 — stale README (not a code bug, a demo-reliability risk)

**Symptom:** `README.md` only documents "Phase 1" through "Phase 6" (foundational endpoints through degradation/RUL) — no frontend setup instructions anywhere, no mention of the live fault-injection endpoint (`/api/simulator/fault`, added session 4), no mention of the existing `.venv`, and Unix-only shell commands (`source .venv/bin/activate`, `./mvnw`) with no Windows equivalents on a Windows dev machine. Anyone other than the current developer following this file literally would not get a working demo.

**Fix:** added a "Quick Start (current system, all phases)" section at the top — accurate three-terminal startup (Python via the existing `.venv`, Java via `mvnw.cmd`/`mvnw`, frontend via `npm run dev`), the ML-artifact-generation step required on a fresh clone, the live fault-injection `curl` example with the real 120s onset-timing caveat, and Windows+Unix command variants. The historical Phase 1-6 walkthrough is left intact below it as a build-history/endpoint reference, not replaced.

#### API contract / integration audit (no further bugs found)

Reviewed `DiagnosticController`/`HealthController`/`DegradationController`/`RulController`'s 503 catch blocks, `SimulationState`'s fault-activation/reset logic (fully resets `faultSeverityOverride`/`faultActivatedAtSeconds` on every `activateFault()` call, no leakage risk), `DiagnosticService.resetHistory()`'s call site in `SimulatorController` (clears history on every fault change — activation and reset-to-healthy alike), and the frontend's null-handling across `App.tsx`, `AlertBanner.tsx`, `DegradationRulPanel.tsx` (honest `rulHours != null ? ... : "—"` pattern throughout, no fabrication, no unguarded `.toFixed()` on a possibly-null value found in any panel) — no additional concrete bugs found. One pre-existing, minor, unchanged gap noted: `DiagnosticController` does not catch `DegradationServiceUnavailableException` (only `HealthController`/`DegradationController`/`RulController` do) — would surface as an uncaught exception (likely raw 500) if *only* the degradation service specifically failed while ML/health/physics succeeded; not reproduced or fixed this session (narrow, pre-existing, not touched by any of this session's changes, out of scope for "fix only concrete bugs found").

No browser-automation tool is available in this environment (checked via tool search) — frontend resilience was audited at the source level only (see above), consistent with every prior session's documented limitation. This remains the single biggest gap in demo confidence: the panels have never been visually rendered and eyeballed in this environment.

#### Live fault sequence validation (Workstream 3)

Full `NORMAL → INJECTOR → NORMAL → LUBRICATION → NORMAL → MISFIRE → NORMAL → SENSOR_DRIFT → NORMAL` sequence run live (severity 0.9, ~135s past onset each), capturing telemetry, residuals, anomaly score/gate, classifier confidence, isolation, health, degradation, RUL, and mission-simulate for every step. **Reset integrity confirmed at all 4 NORMAL checkpoints**: residuals converge to ≤0.13 max-abs (and exactly 0.0000 on 3 of 4), `overallHealth` returns to 100.00 `HEALTHY`, `dominantMechanism=HEALTHY`, and — importantly — `rul.status=INSUFFICIENT_HISTORY` immediately after every reset (correct, honest behavior: RUL does not carry over stale confidence from the previous scenario). No cross-scenario contamination observed.

#### Backend recovery (fresh re-verification, high-value given `DiagnosticService` was rewritten this session)

Killed the Python process mid-session, live: `/api/diagnostics/current`/`/api/twin/current`/`/api/health/current` → `503` with the correct `physics-unavailable` body (partial telemetry included) on every hit; `/api/telemetry/current` stayed `200` (frozen values); `/api/simulator/fault` correctly reported `healthyBaselineFresh: false`. Restarted Python: automatic recovery to `200`/`healthyBaselineFresh: true` within one scheduler tick, no manual intervention. **This directly confirms the `tick()`/`getCurrentDiagnostics()` split's stored-failure-and-rethrow design (§15.9) preserves the exact pre-existing 503 contract in a real live outage, not just in unit tests.**

### 15.12 Final SIH Demo Readiness Sprint — Real-Browser QA + Live E2E Sweep (2026-09-10)

**Status: Real-browser QA performed for the first time (a Chrome automation tool was available this session, resolving the single biggest previously-documented confidence gap). Full live NORMAL→fault→NORMAL sweep re-run for all 4 faults with the dashboard open and observed at every step. Two small, isolated bugs found and fixed. FINDING-3 and the Injector/Sensor-Drift anomaly-gate conservatism remain open and are NOT claimed resolved.**

#### Phase 1 — Real-browser QA

All three services (Python via `.venv`, Java via `mvnw.cmd` through PowerShell, frontend via `npm run dev`) were started fresh, in order, each verified independently before starting the next (model artifacts already present, no `generate_dataset`/`training` re-run needed). The dashboard was opened and inspected end-to-end in a real Chrome tab: page loads, no blank screen, no React error boundary, zero console errors/exceptions across the entire sprint (checked repeatedly, including after the fault sequence and repeated Mission/What-If clicks), no layout cutoff at any panel, all 45+ network requests observed returned 200, CORS confirmed working from `localhost:5173` to `localhost:8080`. The 5-option fault dropdown (Normal/Injector/Lubrication/Misfire/Sensor Drift) was confirmed present and functional.

**Bug found and fixed — AlertBanner headline falsely says "Engine nominal" while degraded.** `AlertBanner.tsx`'s headline logic branched only on `diagnosticType` (`SENSOR_FAULT` / `PHYSICAL_FAULT` / else); the "else" branch unconditionally rendered `"Engine nominal — overall health X (Y)."` regardless of `health.status`. Reproduced live: during Injector Degradation (health 84.9, status `CAUTION`) and Lubrication Degradation (health 77.2, status `CAUTION`) — both cases where the anomaly gate had not (yet) crossed so `diagnosticType` stayed `NORMAL` — the banner read *"Engine nominal — overall health 77.2 (Caution)."*, contradicting its own CAUTION badge one line below. This is exactly the kind of self-contradicting copy that would confuse a judge watching the dashboard live. **Root cause:** the same `diagnosticType=NORMAL` overload BUG-4 already identified (it means both "genuinely healthy" and "anomaly-gate-suppressed but a real fault is present") was being read by this component without also checking `health.status`, unlike the isolation-panel fix BUG-4 applied to the backend. **Fix (frontend only, `AlertBanner.tsx`):** the fallback branch now checks `health.status === "HEALTHY"` — only then does it say "Engine nominal"; otherwise it honestly renders `"Overall health X (Y) — no corroborated fault diagnosis yet."` **Verification:** no frontend test framework exists in this repo (`package.json` has no test script, no vitest/jest) — adding one was judged out of scope for a one-line text fix, so verification was live/manual: re-rendered via Vite HMR and re-screenshotted during both Injector and Lubrication activations post-fix, confirming the banner now matches its own badge in both cases; `npm run build` (`tsc && vite build`) passes with 0 errors, confirming no type regression. This is a small, isolated, frontend-only text-logic change — no backend/algorithm/API contract touched.

No other frontend bugs found. Per-panel checks (Engine Health, Live Telemetry, Physics Twin, AI Diagnosis, Sensor Isolation, Degradation/RUL, Mission/What-If, Simulator Controls) all passed — see Phase 2 below for the evidence, captured together with the live fault sweep.

#### Phase 2 — Live end-to-end demo sweep

Full `NORMAL → INJECTOR_DEGRADATION → NORMAL → LUBRICATION_DEGRADATION → NORMAL → MISFIRE → NORMAL → SENSOR_DRIFT → NORMAL` sequence run live, severity 0.9 fixed override, each fault allowed its real ~120s onset (no shortcuts), dashboard screenshotted at each step, console checked for errors throughout. Full results in the FINAL AEROTWIN-X DEMO READINESS REPORT below (§ delivered to the user this session) — headline findings:

- **NORMAL** (×5 checkpoints, one per fault reset): residuals exactly 0.0 every time, health returns to 100.00, RUL honestly `None`/`STABLE`, no stale prior-fault state observed at any checkpoint.
- **INJECTOR_DEGRADATION**: classifier 97.8% confident at onset; anomaly gate stayed below threshold (0.58 plateau) so `predictedFault` stayed `NORMAL` — correctly conservative, not a bug; `diagnosticType=NORMAL` (BUG-4's fix holds, no false `SENSOR_FAULT`); dashboard's Fault Probability bars correctly surfaced Injector at 98% even while the top-line verdict stayed conservative, exactly the intended "useful diagnosis even when the gate doesn't cross" behavior.
- **LUBRICATION_DEGRADATION**: anomaly gate crossed at onset (0.640), `predictedFault` flipped correctly, then settled into the documented borderline 0.60–0.61 plateau (mostly not crossing) — matches §15.9's evidence exactly, reproduced fresh this session. Classifier 98%, health dropped to a real 77.2 (Caution), Degradation panel showed real Lubrication-dominant mechanism (51%) — this remains the strongest demo scenario.
- **MISFIRE**: 4/12 five-second samples crossed the gate (33%), matching the documented ~33% stochastic rate; classifier 97%; SHAP explanation rendered correctly the moment anomaly=true was observed live (first live SHAP capture with a real browser); RUL correctly showed `UNRELIABLE` with an honest explanation of the fault's noisy trajectory. No false `SENSOR_FAULT` observed in any sample (BUG-4 holds for Misfire too).
- **SENSOR_DRIFT**: anomaly gate never crossed even past onset (flat ~0.53–0.55) while residuals demonstrably grew linearly and unboundedly with elapsed time (rpm residual 47→66 over 80s, confirmed live) — reproducing the documented unbounded-drift fault model exactly. Classifier internally identified Sensor Drift at 98% confidence, but the isolation panel correctly stayed `NORMAL`/all-`HEALTHY` (FINDING-3, confirmed still open, no crash, no misleading certainty — graceful as required).

**No changes were made to any fault model, threshold, classifier, or isolation algorithm.** FINDING-3 is explicitly not claimed resolved.

**Mission What-If**, exercised through the UI: `Run Mission Simulation` and `Run What-If` both produce real, non-fabricated results (per-phase health decay, risk band, reliability %, a real baseline-vs-scenario delta with a coherent narrative); both were clicked repeatedly with no crash, no duplicate/stale panels, and continuously-updating live sample counts confirming the polling loop kept running underneath.

**WebSocket**, verified manually with a one-off Node script using Node 22's built-in `WebSocket` client (no new dependency added — `ws` npm package is not installed and was deliberately not added): 5 consecutive frames at a true ~1.000s cadence, `timestamp` confirmed `typeof "string"`, ISO-8601 (BUG-3 fix holds), full flat payload with no null/NaN leakage. Reconnect was not independently re-tested this sprint (the frontend's `useTelemetryStream.ts` reconnect logic was reviewed at the source level in the overnight sprint, §15.11, and not touched since) — not adding automated WS test infrastructure, per the explicit instruction to keep manual verification acceptable rather than build new test scaffolding for it.

**Backend recovery**, re-verified fresh with the dashboard open and watched live: killed the Python process → Java correctly returned `503 physics-unavailable` with partial telemetry, `/api/telemetry/current` stayed `200` (frozen WS-fed values), and the **frontend rendered a clean "SERVICE UNAVAILABLE" banner with honest per-panel "unavailable"/"waiting for snapshot" states — zero console errors during the entire outage, first time this has been confirmed in an actual browser rather than by source-reading.** Restarted Python → Java auto-recovered (`healthyBaselineFresh: true`) within seconds with no Java restart, and the dashboard returned to a fully healthy render with no manual refresh needed (though one was done to reconfirm).

#### Bug found and fixed — `DiagnosticController` missing `DegradationServiceUnavailableException` catch (BUG-5)

This was a previously-documented, pre-existing gap (noted since the overnight sprint, §15.11) re-assessed this sprint per the task's explicit backend error-handling audit instruction. **Confirmed real and reproducible from source, not just theoretical:** `DiagnosticService.tick()` catches `DegradationServiceUnavailableException` alongside the other three downstream-unavailable exception types and stores it via `lastTickFailure`; `getCurrentDiagnostics()` re-throws whichever exception was stored, so a degradation-service-only failure genuinely produces a `DegradationServiceUnavailableException` on the `/api/diagnostics/current` path. `DiagnosticController` catches `MLServiceUnavailableException`, `HealthServiceUnavailableException`, and `PhysicsServiceUnavailableException` but not this one — an uncaught exception would have surfaced as a raw Spring 500 instead of the clean `503 {"status":"degradation-unavailable", ...}` every other controller (`DegradationController`, and indirectly `HealthController`/`RulController`) already returns for the same failure mode.

**Fix:** added one `catch (DegradationServiceUnavailableException exception)` block to `DiagnosticController.getCurrentDiagnostics()`, placed first (mirroring `DegradationController`'s existing ordering) and using the exact same response shape `DegradationController` already returns (`Map.of("status", "degradation-unavailable", "message", ...)`). No other controller touched — `HealthController` and `RulController` don't call the degradation path directly in a way that risks this, and were left as-is.

**Regression test:** `DiagnosticControllerTest.reportsDegradationUnavailableAsCleanServiceUnavailableInsteadOfARaw500` — mocks `diagnosticService.getCurrentDiagnostics()` to throw `DegradationServiceUnavailableException`, asserts `503` + `status=degradation-unavailable`. Confirmed present and passing (`DiagnosticControllerTest`: 3/3, up from 2/2).

**Verification:** `mvnw test` → 53/53 pass (up from 52/52), `BUILD SUCCESS`. Not independently re-verified live against a real selective-degradation-only outage (would require artificially breaking only the degradation code path, judged disproportionate for a one-catch-block fix) — the MockMvc-level test is a direct, non-vacuous assertion of the exact contract, consistent with how this gap was originally identified (source-level, not live).

#### Phase 3 — Repository hygiene

- `git status`/`git diff`/`git diff --stat` reviewed in full. No secrets, no accidental generated artifacts beyond the already-known `backend/target/` (see below), no temp/debug/experiment files, no duplicate files. All untracked non-`target` files are legitimate session-4-era source/test files or the whole never-committed `frontend/` app — nothing left behind from this session's own work beyond the two bug fixes and this document.
- **`backend/target/` is tracked** (confirmed: shows as `M`odified, not untracked, across ~30 files every build) **with no `.gitignore` anywhere in the repo prior to this session.** Added a root `.gitignore` (`backend/target/`, IDE folders, OS cruft) — this stops *new* untracked noise but, since the files are already tracked, does not by itself remove them from git's index. **Untracking them (`git rm -r --cached backend/target/`) is proposed but deliberately NOT executed this session** — it touches ~90 already-committed files repository-wide and the task's own change-control rules call for treating that as a reviewed decision, not an autonomous one. Recommended as the next hygiene action, pending explicit approval.
- README's "Quick Start" section (added overnight sprint, §15.11) was re-checked against this session's actual live startup: the Python command, `mvnw.cmd spring-boot:run`, `npm install && npm run dev`, and the fault-injection `curl` example (including the ~120s onset caveat) all matched real, tested behavior exactly. **No README changes were needed.**

#### Final test results (this sprint)

```
Java:     mvnw test  → 53/53 PASS, BUILD SUCCESS (52 pre-existing + 1 new DiagnosticControllerTest case)
Python:   pytest -q  → 74/74 PASS, 1 harmless deprecation warning (unchanged)
Frontend: npm run build → PASS, 0 errors (AlertBanner.tsx fix included, tsc clean)
```

#### Final live sanity check

Post-fixes, post-full-test-pass: NORMAL (health 100.00, anomaly=false) → `LUBRICATION_DEGRADATION` severity 0.9 → confirmed live at t=120s (anomaly=true, `predictedFault=LUBRICATION_DEGRADATION`, `diagnosticType=PHYSICAL_FAULT`, health 98.51 dropping correctly) → dashboard screenshotted mid-fault, zero console errors → reset to `NORMAL` → residuals exactly 0.0, health 100.00 again. All three services still running and healthy at the end of this sprint.

### 15.13 Repository Hygiene Cleanup — `backend/target/` Untracked (2026-09-10, approved)

**Status: DONE, approved and executed.** §15.12 proposed but deliberately did not execute untracking `backend/target/`; explicit user approval was given immediately after, and the cleanup was carried out exactly as scoped — no history rewrite, no destructive reset, no source files touched.

**Action:** `git rm -r --cached backend/target/` — removed 96 files from git's index. The `.gitignore` added in §15.12 already covered `backend/target/`; this step makes that coverage actually take effect for already-tracked files.

**What did NOT happen (confirmed):** the local `backend/target/` directory was not deleted (Maven still has its compiled classes/reports on disk — confirmed present after the `rm --cached`); no git history was rewritten; no `reset --hard` or other destructive command was used; no source file (`src/`, `pom.xml`, etc.) was touched; no file outside `backend/target/` was staged.

**Verification:**
```
Java:     mvnw test  → 53/53 PASS, BUILD SUCCESS (unchanged from §15.12's baseline)
Python:   pytest -q  → 74/74 PASS, 1 harmless warning (unchanged, untouched by this cleanup)
Frontend: npm run build → PASS, 0 errors (unchanged, untouched by this cleanup)
```
`git status` post-cleanup: 96 files staged as deletions (all under `backend/target/`, nothing else), the same 21 legitimate source/test files from §15.12 still unstaged-modified, the same legitimate untracked files (now including `.gitignore` itself) — no new unexpected entries, no secrets, no temp files, `backend/target/` no longer appears as modified/untracked at all (correctly hidden by `.gitignore` now that it's untracked).

**Not committed at the time of this entry.** `git rm -r --cached` stages the removal; per this project's standing rule (commit only when explicitly asked), the staged removal was initially left uncommitted. A commit and push were requested immediately after and are recorded in §15.14 below.

**FINDING-3, FINDING-5, the anomaly-gate conservatism, and BUG-3's WEBSOCKET status are unchanged by this cleanup** — it touched only git's tracking of compiled build output, nothing behavioral.

### 15.14 Publication — Pushed to GitHub (2026-09-10)

**Status: PUBLISHED.** The full AeroTwin-X SIH MVP — Java backend, Python physics/ML service, frontend, all fault-injection/diagnostics/mission code, tests, documentation, and the `backend/target/` hygiene cleanup (§15.13) — was committed in one clean commit and pushed to the project's GitHub remote (`origin` → `Tictiate/AeroTwin-X.git`, branch `main`).

**Pre-push audit:** `git status`/`git diff --stat`/`git diff --cached --stat` reviewed in full before staging. One pre-existing detail worth recording: `.vscode/settings.json` was already tracked from an earlier commit (two harmless Java-extension settings, no secrets, no local paths) — noticed only because it doesn't appear in `git status` when unmodified; left untouched, not part of this sprint's work.

**Secrets check:** grepped the full staged diff and the whole working tree for API-key/token/password/private-key patterns and for `.env` files — none found. No secrets committed.

**Staged:** `git add -A` → 161 files (96 `backend/target/` deletions + all legitimate source/test/frontend/Python/documentation changes from this project's sessions). Verified via `git status` and `git diff --cached --stat` that nothing unrelated, generated, or secret was included.

**Final pre-commit tests:** Java `mvnw test` 53/53 PASS · Python `pytest -q` 74/74 PASS · Frontend `npm run build` PASS, 0 errors — all three unchanged from every prior checkpoint this sprint.

**Commit:** one commit, message `feat: complete AeroTwin-X SIH MVP` (plus attribution trailer). No history rewrite, no force-push, no amend of prior commits.

**Push:** `git push` (normal, no `--force`) to `origin main`. See the session's final report to the user for the exact commit hash and push confirmation.

**Post-push verification:** `git status` confirmed a clean working tree (aside from any local-only ignored files); `git log -1 --oneline` confirmed the new commit is HEAD on `main`.

**No engineering changes were made in this step.** FINDING-3 remains OPEN, FINDING-5 remains PARTIALLY RESOLVED, the anomaly gate remains CONSERVATIVE BY DESIGN, WebSocket remains WORKING (BUG-3 fixed) — this section records publication only.

## 16. Remaining Work

See §17 for prioritization. `backend/target/` untracking is **DONE** (§15.13) — no longer an open item. Remaining headline items: decide on and add environment-specific backend config, add mission-boundary isolation to the live Java history, and (not urgent) committing this sprint's staged/uncommitted changes when the user is ready. Real-browser QA is **no longer an open gap** — performed this sprint (§15.12), found and fixed two small isolated bugs (AlertBanner wording, BUG-5 DiagnosticController exception handling). FINDING-5's two secondary contributors (live telemetry noise, permanent `missionPhase="IDLE"`) were quantified and closed as document-only, evidence-backed (§15.10) — not planned for further work absent new evidence. The anomaly-detector-threshold item from prior sessions is closed as "no threshold change warranted" (§15.7). FINDING-5's primary contributor (history-buffer cadence) is fixed and verified (§15.9), re-confirmed live this sprint. BUG-3, BUG-4, and BUG-5 are all fixed and verified. FINDING-3 (sensor-drift multi-channel isolation) remains open, explicitly untouched by any fix to date, re-confirmed live this sprint (§15.12) with graceful (non-crashing, non-misleading) behavior.

## 17. Prioritized Development Roadmap

**P0 — Blocking**
- ~~Health/Degradation/RUL controllers leaking raw 500s~~ — FIXED session 1 (§8, §19).
- None open.

**P1 — Critical for a convincing SIH prototype**
- ~~Build the frontend from scratch~~ — DONE session 2 (§11, §19). Real-browser visual QA still outstanding (no browser tool was available in this environment — see §11/§21).
- ~~Live-verify all 4 fault scenarios (mission chain)~~ — DONE session 3 (§15.1, §19).
- ~~Give the live diagnostics chain a way to produce fault conditions~~ — DONE session 4 (§15.3, §19): `POST /api/simulator/fault` + a live simulator control panel in the frontend. Telemetry/physics/residuals confirmed correctly perturbed live for all 4 faults.
- ~~Wire real diagnostic history into `/ml/analyze`~~ — DONE session 5 (§15.4, §19): fixed, verified at both the direct-contract and behavioral level, with a real, measured improvement for Misfire. **Did not resolve Injector Degradation or Sensor Drift live** — that gap has a different, now-identified root cause (next item).
- ~~Scope FINDING-4: why does live Injector Degradation misclassify when the offline sample doesn't~~ — INVESTIGATED session 6 (§15.5, §19).
- ~~Implement Option B: make Java's live simulator source healthy telemetry from `PhysicsServiceClient.predict()`~~ — **DONE and VERIFIED, implementation session (§15.6, §19).** Healthy-baseline residuals now exactly zero for 5/7 channels live; physics equivalence confirmed to 6 decimal places; Injector/Lubrication/Misfire classifier confidence now 97-98% (was 5-22% pre-fix for Injector). **FINDING-4 is RESOLVED.**
- ~~Investigate and improve the anomaly-detector threshold gate~~ — **INVESTIGATED session 8 (§15.7, §19).** Root cause: offline separability is near-chance (AUC~0.59) and uniform across all 4 fault types — the threshold is a defensible, near-optimal operating point, **not miscalibrated, not changed**. A separate, newly-identified live/offline distribution gap (FINDING-5, §8) explains why Lubrication/Misfire reliably cross live despite offline evidence saying they shouldn't — see next item.
- ~~Root-cause FINDING-5~~ — **ROOT-CAUSED session 8 (§15.8).** Three concrete mechanisms identified with direct feature-level evidence: (1) `DiagnosticService`'s history buffer samples at REST-poll cadence instead of the existing 1Hz scheduler — the largest, causally-confirmed contributor; (2) live's context-driven telemetry has exactly-zero rolling variance (a side effect of FINDING-4's fix) vs. offline's real per-tick noise; (3) `missionPhase_IDLE` is always-1 live, always-0 in training.
- ~~Implement FINDING-5's recommended fix (history-buffer cadence)~~ — **DONE and VERIFIED session 8 (§15.9).** `DiagnosticService.tick()`/`getCurrentDiagnostics()` split; history now populated exclusively by the existing 1Hz `SimulationService` scheduler. Poll-rate independence causally proven live (97 REST polls at 4 different rates had zero effect on history growth). Lubrication's slow-cadence and fast-cadence scores now converge (~0.60-0.61 both), a complete reversal from the pre-fix divergence. **FINDING-5 is partially resolved** — mechanisms 2 and 3 below remain.
- ~~Investigate FINDING-5's 2 secondary contributors~~ — **QUANTIFIED and CLOSED as document-only, overnight sprint (§15.10).** Both isolated via controlled ablation against the real trained detector: zero-noise effect -0.0035 to +0.0094, mission-phase-IDLE effect ≤0.03 across all 7 phases (IDLE trends *low*, not high). Neither is material; fixing either would touch `SimulationState`/`HealthyEngineSimulator` for a negligible/non-existent benefit. **Not planned further absent new evidence.**
- ~~Fix BUG-4: sensor-isolation gate falsely labels real physical faults as SENSOR_FAULT~~ — **FOUND and FIXED, overnight sprint (§8 BUG-4, §15.11).** Root cause: the gate used the anomaly-gated `predictedFault` instead of the classifier's raw `faultProbabilities`. Verified live across all 4 fault types; Injector/Misfire no longer misattributed, Lubrication/Sensor-Drift unchanged (FINDING-3 untouched).
- Add a real WebSocket client smoke test to the automated test suite (still not done — verified manually with a Node client in sessions 2, 5, 7, and the overnight sprint, nothing regression-tests it).

**P2 — Important**
- ~~Fix BUG-3~~ — **FIXED overnight sprint (§8, §15.11).** `TelemetryWebSocketHandler` now uses the Spring-managed `ObjectMapper`; WS `timestamp` serializes as ISO-8601, verified live with a real Node client.
- Sensor-drift isolation heuristic doesn't handle a fault that perturbs multiple channels at once (§8 FINDING-3, §15.3) — confirmed unaffected by both the session-5 ML-history fix and the session-7 FINDING-4 resolution (isolation still didn't trigger in a ~313s live re-run post-fix). Genuinely independent of both prior fixes; can be investigated on its own terms now, or alongside the anomaly-threshold-gate item above.
- Add mission-boundary reset to the live Java `DiagnosticService` history (currently only the offline replay script has this; the session-4 fault-activation history reset is a related but distinct mechanism — see §15.3).
- Backend environment-specific configuration (`application.yml` with profiles) instead of hardcoded `@Value` defaults.
- Clean up committed `backend/target/` build artifacts + add `.gitignore` (deliberate, reviewed commit).
- CHT/oil-temperature residual damping (§8 FINDING-2): documented, not a bug, but worth keeping in mind when interpreting or presenting residual charts for those two channels specifically.
- ~~Lubrication Degradation's borderline anomaly-score behavior~~ — investigated session 8 (§15.7): no longer borderline live (4/4 reliable crossings), but this is now understood to be a live-only effect not reproduced by the offline-trained model (FINDING-5, §8) — folded into the FINDING-5 root-cause item above, not a separate open item.
- ~~FINDING-5 secondary contributor — live context-driven telemetry has exactly-zero per-tick variance~~ — **QUANTIFIED and CLOSED as document-only (overnight sprint, §15.10).** Isolated ablation against the real trained detector: effect size -0.0035 to +0.0094 across NORMAL + all 4 faults, negligible. **Decision C — no code changed.**
- ~~FINDING-5 secondary contributor — live `missionPhase` is permanently `"IDLE"`~~ — **QUANTIFIED and CLOSED as document-only (overnight sprint, §15.10).** Isolated ablation across all 7 mission-phase settings: full range only ~0.027-0.028, and `IDLE` specifically scores at/near the *low* end (not elevated). **Decision C — no code changed.**
- **NEW, open, not yet identified:** a ~0.09-0.12 gap remains between live's post-cadence-fix Lubrication steady-state (~0.60-0.61) and the offline matched-scenario steady-state (~0.49-0.57) that neither of the above two contributors explains, alone or combined (§15.10). Flagged honestly as unexplained — not pursued this sprint, would need its own dedicated investigation.

**P3 — Enhancement**
- Docker/deployment configuration (none exists).
- Broader SHAP visibility once anomaly recall is improved.
- Fleet-level analytics, if ever needed.

**P4 — Future**
- Any advanced ML (Transformer/LSTM/PINN) — explicitly out of scope per §49 until current models are exhausted.
- Real engine telemetry integration.

## 18. Current Sprint

**Goal:** (session 2) Build the single highest-priority unfinished piece — the frontend — as a thin, honest consumer of the already-verified backend contracts, and confirm the whole operator story is visible for the first time.

**Why:** Session 1's audit concluded explicitly: "the backend/physics/ML stack is demo-ready as an API. There is currently nothing to put in front of a judge visually." No P0 blocker or E2E integration failure remained open, so per the priority order (P0 → E2E failure → P1 → validation weakness → P2 → P3), the frontend was next.

**Tasks:**
- [x] Re-read `AEROTWIN_PROJECT_MASTER.md` and confirm frontend is still the correct highest-priority item from current repo state (not from memory).
- [x] Map every Java/Python endpoint, DTO, WebSocket message shape, and 503 error shape from source before writing any frontend code.
- [x] Scaffold Vite + React + TypeScript app, mirroring DTOs field-for-field.
- [x] Build 2s diagnostics-polling hook + WebSocket telemetry hook with reconnect.
- [x] Build all required panels (health, telemetry, twin/residuals, diagnosis+SHAP, sensor isolation, degradation/RUL, mission simulate + what-if) plus an alert/recommendation banner.
- [x] `npm run build` clean.
- [x] Live-verify against the real running Java+Python stack: data shapes, CORS from the real origin, WebSocket with a real client, 503/unavailable states, recovery.
- [x] Confirm no backend/ML/physics files were touched (scope discipline).
- [x] Update `AEROTWIN_PROJECT_MASTER.md`.

**Definition of Done:**
- [x] `npm run build` succeeds with 0 TypeScript errors.
- [x] Every panel's data contract verified against a live `curl` of the same endpoint, not assumed from source alone.
- [x] 503 states verified live (Python killed) to render through the same code path the UI uses, not a separate test harness.
- [x] Master file updated with exact commands/results for this session.

**Verification:** see §19 Completed Work Log for the full command/result list.

### (session 3, 2026-09-09) P1 fault-scenario validation

**Goal:** Verify the session-2 frontend correctly represents the backend's 4 already-implemented fault scenarios (Injector Degradation, Lubrication Degradation, Misfire, Sensor Drift), not just NORMAL, and establish real evidence rather than assume the frontend "just works" because it compiled.

**Why:** With the frontend accepted as done and no P0/E2E-failure open, this was next per the priority order (P0 → E2E failure → P1 → validation weakness → P2 → P3): P1 core functionality validation.

**Tasks:**
- [x] Re-read `AEROTWIN_PROJECT_MASTER.md`, the frontend implementation, backend contracts, fault-injection code, and existing tests before touching anything.
- [x] Establish, from source (not assumption), exactly how each fault scenario can be triggered today, and where the live-injection ceiling is.
- [x] Determine the live simulator (`HealthyEngineSimulator`) has zero fault-injection capability — confirmed via `grep` across all backend controllers/simulators and a 5-sample live poll showing `NORMAL` throughout.
- [x] Determine `mission_simulator.py`'s `fault_type` parameter is the only live, frontend-reachable fault-conditioning path, and read exactly what it does and does not compute.
- [x] Add a minimal fault-condition selector to `MissionSection.tsx` (existing DTO fields only, no new backend surface) so this path is actually exercisable through the frontend.
- [x] Re-run `scripts/replay_rul.py` against session 1's existing fault-injected datasets to get real, offline, full-chain (health/degradation/RUL) evidence per scenario from the actual `health_calculator`/`degradation_estimator` code.
- [x] Live-test `POST /api/mission/simulate` and `POST /api/mission/what-if` for all 4 fault types against the real running Java+Python stack.
- [x] Re-confirm NORMAL live through `/api/diagnostics/current`.
- [x] `npm run build` after the frontend change — clean.
- [x] Write the full validation record (§15.1) with PASS/PARTIAL/FAIL/BLOCKED per scenario and exact evidence.
- [x] Confirm no backend files or unrelated frontend files changed (`git status`).
- [x] Update `AEROTWIN_PROJECT_MASTER.md`.

**Definition of Done:**
- [x] Every scenario has a recorded Trigger / Backend Evidence / Frontend Evidence / Expected / Actual / Result / Issues Found entry.
- [x] No scenario's result is asserted without a command and its real output attached.
- [x] The genuinely-blocked portion of the chain is documented as BLOCKED with a specific, source-level reason — not silently passed over or force-fixed.
- [x] No backend logic changed to force a UI result; no frontend logic changed to manufacture an expected state.

**Verification:** see §19 Completed Work Log below and §15.1 for the full evidence.

### (session 4, 2026-09-09) P1 live fault injection into the primary diagnostics chain

**Goal:** Give the live telemetry/diagnostics chain (not just Mission) the ability to show a real fault propagating in real time, closing the exact gap session 3 identified and documented as BLOCKED.

**Why:** Session 3's own conclusion named this the next P1 item: the primary dashboard could only ever show NORMAL, because the live simulator had no fault-injection capability at all.

**Tasks:**
- [x] Re-read the master file, frontend, backend contracts, existing fault models, offline replay implementation, and existing tests before designing anything.
- [x] Confirm `HealthyEngineSimulator`/`SimulationService`/`SimulationState` have no fault hooks (re-verified from source, not assumed from session 3's notes).
- [x] Read `fault_models.py` and `dataset_generator.py`'s invocation pattern fully to understand exactly how `FaultSchedule`/`FAULT_MODELS`/`FaultModel.apply()` are meant to be used.
- [x] Decide the architecture: Python keeps 100% ownership of fault math (new thin `/simulation/inject-fault` wrapper around the existing `FAULT_MODELS`), Java owns only simulator control state and orchestration — consistent with every other domain algorithm in this system already living exclusively in Python.
- [x] Implement the Python endpoint, wire it into `main.py`, write and pass 8 new tests covering onset gating, fixed-severity override, determinism, and validation.
- [x] Implement the Java side: `FaultType` enum, `FaultControlRequest`/`SimulatorFaultState` DTOs, `FaultInjectionServiceClient`, `SimulationState` fault-clock fields, `SimulationService.tick()` integration with a tested fallback-on-failure path, `DiagnosticService.resetHistory()`, `SimulatorController`.
- [x] Write and pass 17 new Java tests (state machine, service fallback behavior, controller contract/validation).
- [x] Add a live simulator fault-control panel to the frontend (`SimulatorControlPanel.tsx`), distinct from Mission's hypothetical fault selector.
- [x] `npm run build` clean after the frontend change.
- [x] Run the full Java (38/38) and Python (64/64) suites — no regressions.
- [x] Live-verify all 5 scenarios (NORMAL + 4 faults) against the real running stack, waiting through the real ~120s onset gate each time (not shortcut), polling telemetry/twin/diagnostics repeatedly to observe real temporal behavior and history accumulation.
- [x] When Injector Degradation and Sensor Drift didn't behave as expected, stop and diagnose rather than force a result — traced both to precise, confirmed root causes (§8 FINDING-1/2/3, §15.3) rather than leaving them as unexplained anomalies.
- [x] Reset the simulator to healthy after every scenario; confirmed final state is NORMAL.
- [x] Write the full validation record (§15.3) with architecture, API, semantics, and per-scenario evidence.
- [x] Confirm `git status`/`git diff` show only the intended files.
- [x] Update `AEROTWIN_PROJECT_MASTER.md`.

**Definition of Done:**
- [x] `POST /api/simulator/fault` activates each of the 4 fault types and reset-to-healthy, all confirmed live, not just via source inspection.
- [x] For each fault, real telemetry/residual perturbation observed live, matching the existing fault model's own math.
- [x] Every deviation from the expected chain (diagnosis mislabeling, sensor-isolation gap) is classified and root-caused, not hidden or silently accepted.
- [x] NORMAL behavior confirmed byte-for-byte unchanged (no fault-injection call made at all when inactive).
- [x] No backend physics/ML/health/degradation/mission algorithm code was modified — only new orchestration code and one new thin Python wrapper around existing, unmodified fault models.

**Verification:** see below and §15.3 for full evidence.

### (session 5, 2026-09-09) P1 wire real diagnostic history into `/ml/analyze`

**Goal:** Fix the specific integration gap FINDING-1 identified — `MLServiceClient` never sending diagnostic history to `/ml/analyze` — then measure the actual effect on live diagnosis, not assume it fixes everything.

**Why:** Named as the top P1 candidate by session 4's own findings: the most specific, actionable, well-evidenced root cause on the roadmap.

**Tasks:**
- [x] Re-read the master file (§15.3), `MLServiceClient`, `/ml/analyze`, `MLAnalyzeRequest`, `build_live_features`, `DiagnosticService`'s history buffer, and existing Python/Java tests before writing any code.
- [x] Determine the exact required history shape (flat feature-row dicts, not nested) by reading `build_live_features`/`validate_dataset` directly, and confirm it differs from health/degradation's existing nested history DTOs.
- [x] Confirm the real history already exists in `DiagnosticService.history` and is already passed to health/degradation in the same method, establishing the precedent to mirror.
- [x] Implement `MLServiceClient.analyze(TwinSnapshot, List<DiagnosticSnapshot>)`, flattening each history sample via the Spring-managed `ObjectMapper` (constructor-injected).
- [x] Update `DiagnosticService`'s call site to pass `new ArrayList<>(history)`, matching the existing health/degradation pattern.
- [x] Write and pass new Java tests (`MLServiceClientTest` additions, new `DiagnosticServiceTest`) asserting the request shape and the critical current-tick-excluded-from-its-own-history ordering property.
- [x] Write and pass new Python tests (`test_ml_history_integration.py`) using the real trained artifacts and real dataset generator, proving history measurably changes rolling-window features and anomaly scores.
- [x] Run the full Java (43/43) and Python (66/66) suites — no regressions.
- [x] Live-verify the direct contract with temporary request-body instrumentation (added, used, then fully removed — confirmed via `git diff`), catching and fixing a real bug (`runId` missing per history row) in the process.
- [x] Re-verify all 5 scenarios live against the real running stack, with the same rigor as session 4 (real ~120s onset waits), and honestly measure — not assume — the effect on each.
- [x] When Injector Degradation showed no improvement, investigate further rather than stop at "still PARTIAL" — traced to a precise, evidenced new root cause (FINDING-4) via a controlled comparison, not left as an unexplained anomaly.
- [x] Regression-swept mission/simulate, mission/what-if, and WebSocket — all still working.
- [x] Reset the simulator to healthy after every scenario; confirmed final state is NORMAL.
- [x] Confirm `git status`/`git diff` show only the intended files (the fix + its tests; no debug instrumentation left behind).
- [x] Update `AEROTWIN_PROJECT_MASTER.md`.

**Definition of Done:**
- [x] The direct wire contract (Java → Python) is verified with actual captured request data, not just "the endpoint returned 200."
- [x] Every one of the 5 scenarios has an honest before/after comparison against session 4's numbers — no scenario's result asserted without a command and its real output.
- [x] Where the fix did not resolve a scenario, the actual remaining cause is identified and classified (physics/model limitation), not hand-waved.
- [x] No ML/physics/health/degradation algorithm was modified — only the transport of already-computed data.
- [x] No fabricated history, no anomaly-threshold changes, no forced classifications.

**Verification:** see §15.4 for full evidence.

### (session 6, 2026-09-09) P1 FINDING-4 investigation — architecture/scoping session (no implementation)

**Goal:** Determine precisely why offline Injector Degradation telemetry classifies correctly (99.48%) while live telemetry does not, given the missing-history bug is already fixed and ruled out as the sole cause. Produce a concrete, evidenced architectural recommendation — explicitly not an implementation.

**Why:** Named the top P1 item by session 5's own findings; the task required scoping and evidence before any code change, given the risk of an incorrect fix to a not-yet-fully-understood problem.

**Tasks:**
- [x] Re-read the master file (§8 FINDING-4, §15.4) and re-confirm the known evidence before starting.
- [x] Map `HealthyEngineSimulator.java` field-by-field against every Python physics equation file (`engine_model.py`, `combustion.py`, `thermal.py`, `airflow.py`, `environment.py`) that `predict_healthy_state()` calls.
- [x] Discover and confirm from source that the offline generator (`mission_generator.py`) has no independent physics — it calls `predict_healthy_state()` directly and copies its output as "healthy," making offline residuals exactly zero by construction.
- [x] Verify this empirically against the actual training CSV (`healthy_missions.csv` residual columns: mean/std/min/max all exactly 0.0).
- [x] Hand-calculate predicted residuals from the two formula sets at the live operating point, then cross-check against a fresh live capture (5 samples, both services freshly restarted) — confirmed close quantitative agreement on the two dominant channels (rpm, egt).
- [x] Compare the offline Injector Degradation residual signature (from `injector_degradation.csv`) against the live signature (session 5's capture) and identify the exact divergence: the RPM residual sign flips between offline and live.
- [x] Evaluate architecture options A/B/C/D against correctness, maintainability, duplication, regression risk, and architectural fit; recommend Option B with reasoning.
- [x] Identify exact files likely involved and files that should explicitly not change.
- [x] Define a concrete verification plan and flag remaining open questions (Python-unavailable fallback behavior, noise-term retention) honestly rather than assuming answers.
- [x] Update `AEROTWIN_PROJECT_MASTER.md` (§8, §15.5, §17-19).
- [x] Make no code changes — confirmed via `git status` before and after.

**Definition of Done:**
- [x] Root cause is quantified, not just hypothesized — hand-calculated predictions matched fresh live data.
- [x] The exact pipeline stage where offline and live diverge is identified precisely (telemetry generation, before any physics/ML code runs).
- [x] A concrete recommendation is produced with explicit reasoning, not merely a list of options.
- [x] Files likely involved and files that must not change are both listed explicitly.
- [x] FINDING-4 is NOT marked resolved — only investigated, with a documented, unimplemented recommendation.
- [x] No code was written or modified this session.

**Verification:** see §15.5 for the full investigation, evidence, and recommendation.

### (session 7, 2026-09-09) P1 FINDING-4 implementation — Option B

**Goal:** Implement the session-6 recommendation: make Java's live simulator source its healthy telemetry from the canonical Python physics service instead of independent formulas, then measure — not assume — the real effect on live classification.

**Why:** Session 6 produced a concrete, evidenced recommendation and explicitly deferred implementation to a dedicated session; this is that session.

**Tasks:**
- [x] Re-read the master file (§15.5), `HealthyEngineSimulator`, `SimulationService`, `PhysicsServiceClient`, `EngineSimulator`, existing simulator/fault-injection tests before writing code.
- [x] Confirm the exact tick lifecycle and fault-injection layering so the new healthy-baseline source slots in without restructuring `SimulationService.tick()`'s existing fault-injection call.
- [x] Rewrite `HealthyEngineSimulator` to delegate to `PhysicsServiceClient.predict()`, threading CHT/oil-temperature forward as instance state (mirroring the offline generator's `previous.model_copy()` pattern) instead of computing independent physics.
- [x] Design and implement the Python-unavailable fallback: freeze last-known-good telemetry, never fabricate new independent physics, surface a `healthyBaselineFresh` flag via `/api/simulator/fault`.
- [x] Add a regression-guard test asserting the returned telemetry is exactly the canonical prediction's fields (catches any future reintroduction of independent Java math).
- [x] Rewrite `HealthyEngineSimulatorTest` (mocked `PhysicsServiceClient`, no live network dependency) and update `SimulatorControllerTest`/`SimulationServiceTest` for the new DTO field.
- [x] Run full Java (48/48) and Python (66/66) suites plus frontend build — all green.
- [x] Live-verify the healthy-baseline residual distribution (primary falsification test) with 20 fresh NORMAL samples — 5/7 channels exactly zero.
- [x] Live-verify physics equivalence directly (Java telemetry vs. a matched `/physics/predict` call) — exact match to 6 decimal places.
- [x] Live-verify the Python-unavailable fallback by actually killing the physics service mid-session and confirming `healthyBaselineFresh` flips, telemetry stays available and frozen, and `/api/twin/current` still correctly 503s (unchanged, separate dependency) — then confirmed automatic recovery.
- [x] Re-ran all 4 fault scenarios live with real onset waits, and — critically — fed each live-generated feature vector to the actual trained classifier and recorded the real probabilities, not an assumed or hand-constructed result.
- [x] Regression-swept mission/simulate, mission/what-if, and WebSocket — all unaffected.
- [x] Reset the simulator to healthy after every scenario; confirmed final state NORMAL, health=100.00.
- [x] Confirmed `git status`/`git diff` show only the intended files.
- [x] Updated `AEROTWIN_PROJECT_MASTER.md` marking FINDING-4 RESOLVED with full evidence.

**Definition of Done:**
- [x] Python remains the sole source of healthy-physics truth; Java's independent formulas are gone, not duplicated-and-synchronized.
- [x] Healthy-baseline residuals quantitatively confirmed near-zero live, not assumed from the architecture alone.
- [x] Physics equivalence quantitatively confirmed, not assumed.
- [x] The real trained classifier's actual output was captured for all 3 physical fault scenarios — no hardcoded fault-to-label mapping anywhere.
- [x] The Python-unavailable fallback was actually triggered live (Python killed), not just code-reviewed.
- [x] All 4 fault scenarios re-tested; no regression identified.
- [x] Full three-layer test suite green; live regression sweep of mission/WebSocket green.
- [x] The one remaining limitation (anomaly-threshold gate) is reported honestly as separate and pre-existing, not glossed over or claimed fixed.

**Verification:** see §15.6 for the complete implementation record and evidence.

### (session 8, 2026-09-09/2026-09-10) P1 anomaly-gate investigation — no threshold change

**Goal:** investigate why the anomaly-score gate crosses only intermittently despite the classifier (post-FINDING-4) being confident and correct — an investigation/calibration session, not an implementation session. Do not assume the threshold is wrong; do not change it without evidence.

**Why:** §17's top P1 candidate after FINDING-4's resolution — the classifier is now confirmed correct, so the anomaly gate is the last thing standing between a correct diagnosis and what the API actually returns.

**Tasks:**
- [x] Phase 1 — read `AnomalyDetector`, `training.py`, `FaultClassifier`, existing test coverage (found zero dedicated anomaly-detector tests) before forming any hypothesis.
- [x] Phase 2 — collected live evidence across NORMAL + all 4 faults, several minutes each past onset (47 total samples), not one or two ticks.
- [x] Phase 3 — tested and refuted feature-scaling, severity-dilution, and feature-mode hypotheses with controlled, single-variable experiments against the real training pipeline; measured offline AUC-ROC and a full threshold-percentile sweep; ran a matched-parameter offline-vs-live comparison that decisively showed live Lubrication Degradation scores are not reproduced by offline generation of the same scenario.
- [x] Phase 4 — reached a definitive decision: no threshold change warranted, root cause is (1) inherently weak, uniform-across-fault-types offline separability plus (2) a new, separate live/offline distribution gap (FINDING-5) not explained by (1) alone.
- [x] Fixed a real but minor, non-behavioral documentation bug: `training.py`'s exported threshold-selection metadata string said "validation" when the code has always used the train split.
- [x] Added `tests/test_anomaly_detector.py` (7 tests) closing the pre-existing zero-coverage gap, using non-brittle bands rather than exact-float assertions.
- [x] Ran full Python suite (66/66 non-erroring tests pass, 73 collected total; 7 pre-existing xgboost-import errors confirmed unrelated via `git stash` A/B) — Java/frontend untouched, not re-run.
- [x] Reset the live simulator to NORMAL after data collection.
- [x] Updated `AEROTWIN_PROJECT_MASTER.md` with the full investigation, evidence, decision, and new FINDING-5 — did not mark the underlying intermittency "resolved," since it isn't; marked the *investigation* complete and the threshold-calibration question closed.

**Definition of Done:**
- [x] No threshold value changed without evidence — none was found to warrant a change.
- [x] No classifier-confidence hardcoding, no fault-type-selected hardcoding, no gate removal introduced anywhere.
- [x] Root cause reported honestly as two compounding factors, one of which (FINDING-5) is explicitly NOT root-caused this session and is flagged for dedicated future work, not glossed over.
- [x] Regression tests added, using bands/margins rather than brittle exact scores.
- [x] Did not begin another feature after this task.

**Verification:** see §15.7 for the complete investigation record and evidence.

## 19. Completed Work Log

### 2026-09-09 — Full repository audit + BUG-1 fix

Status: COMPLETE

Changes:
- Created `AEROTWIN_PROJECT_MASTER.md` (this file) as the project's living status document.
- Fixed `HealthController`, `DegradationController`, `RulController` to catch `PhysicsServiceClient.PhysicsServiceUnavailableException` and `MLServiceClient.MLServiceUnavailableException` in addition to the exceptions they already handled, returning structured `503` bodies (`status: physics-unavailable` / `ml-unavailable`) instead of letting Spring's default handler return a raw, unexplained `500`.

Files:
- `backend/src/main/java/com/aerotwin/controller/HealthController.java`
- `backend/src/main/java/com/aerotwin/controller/DegradationController.java`
- `backend/src/main/java/com/aerotwin/controller/RulController.java`

Verification:
- Before fix (Python service killed): `GET /api/health/current` → `500 {"status":500,"error":"Internal Server Error"}` (no useful body). Same for `/api/degradation/current`, `/api/rul/current`.
- After fix (Python service killed): all three return `503` with `{"status":"physics-unavailable", "message": "...", ...}` (or `ml-unavailable` if physics is up but ML/artifacts are down).
- Java: 21/21 tests still pass after the change (`mvnw test` → `BUILD SUCCESS`).
- Python: unaffected, 56/56 still pass (no Python files touched).

Remaining:
- BUG-2 (committed `target/` build artifacts) documented but intentionally not fixed this session — needs a deliberate cleanup commit, not a silent side effect of an audit.
- Frontend build (P1) not started — out of scope for an audit-first session per the handover brief's explicit instruction not to implement features before the audit is complete.

### 2026-09-09 — Frontend built (session 2)

Status: COMPLETE

Changes:
- Built a new `frontend/` Vite + React 18 + TypeScript single-page app ("AeroTwin-X Propulsion Health & Mission Reliability Console") consuming the existing, already-verified Java backend contracts. No invented endpoints or fields — every DTO in `frontend/src/api/types.ts` was mirrored field-for-field from the actual Java records (`Telemetry`, `PhysicsPrediction`, `PhysicsResidual`, `MLAnalysis`+`DiagnosticExplanation`+`FeatureContributor`, `HealthResult`+`HealthTrend`+`SensorHealthResult`+`HealthContributor`, `DegradationState`, `RulEstimate`, and all `mission/*` DTOs) read fresh from source before writing any frontend code.
- Data layer: `useDiagnostics` hook polls `GET /api/diagnostics/current` every 2s as the single consistent snapshot; `useTelemetryStream` hook connects to `WS /ws/telemetry` with auto-reconnect and a rolling 40-sample history for sparklines.
- UI: alert/recommendation banner (derived from live `health.status`/`diagnosticType`/`rul.status`), engine health panel (6 subsystem bars + trend), live telemetry panel (8 channels + sparklines + mission context, driven by the WebSocket), physics twin panel (actual-vs-expected table + normalized-residual diverging bars), AI diagnosis panel (anomaly score, fault probability bars, SHAP top contributors when `explanationAvailable`), sensor-vs-physical fault isolation panel, degradation & RUL panel (correctly renders withheld/null RUL), and a mission section with real "Run Mission Simulation" (seeded from live current degradation/RUL) and "Run What-If" (slider-driven scenario vs. baseline comparison with real deltas and the backend's own interpretation text).
- Hand-written dark "ops console" CSS theme — no UI framework/charting library added, kept dependencies to `react`/`react-dom` + Vite tooling only.
- Found BUG-3 while building/verifying the WebSocket hook (documented in §8, not fixed — out of scope for "build the frontend").

Files:
- `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/.gitignore`
- `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/vite-env.d.ts`
- `frontend/src/hooks/useDiagnostics.ts`, `frontend/src/hooks/useTelemetryStream.ts`
- `frontend/src/lib/status.ts`
- `frontend/src/components/{Header,AlertBanner,HealthPanel,TelemetryPanel,TwinResidualPanel,DiagnosisPanel,SensorIsolationPanel,DegradationRulPanel,MissionSection,Bar,Sparkline,StatusPill}.tsx`
- `frontend/src/styles/index.css`, `frontend/src/App.tsx`, `frontend/src/main.tsx`
- (No backend or physics-service files changed this session.)

Verification:
- `npm install` — clean, 68 packages, no install errors.
- `npm run build` (`tsc && vite build`) — **PASS**, 0 TypeScript errors. Output: `dist/assets/index-*.js` 167.95kB (gzip 52.30kB), `dist/assets/index-*.css` 9.73kB (gzip 2.45kB).
- Live stack started (Java :8080, Python :8000, Vite :5173) and cross-checked:
  - `curl http://localhost:8080/api/diagnostics/current` payload compared field-by-field against `DiagnosticSnapshot` TS type — matches exactly.
  - `curl -i -X OPTIONS .../api/diagnostics/current -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"` → `200`, `Access-Control-Allow-Origin: http://localhost:5173`. Actual `GET` with the same Origin header → `200` with the same CORS header. Confirms the frontend's exact origin is allowed, not just "CORS is configured somewhere."
  - Node native `WebSocket` client connected to `ws://localhost:8080/ws/telemetry`, received 3 frames at ~1Hz. (Surfaced BUG-3 in the process — the payload's `timestamp` is a raw epoch float over WS vs. ISO-8601 over REST; frontend doesn't read that field, so unaffected, but documented as a real, separate bug.)
  - Killed Python: `GET /api/diagnostics/current` → `503 {"status":"physics-unavailable","message":"...","telemetry":{...}}`; `POST /api/mission/simulate` and `GET /api/mission/default-profile` → `503 {"status":"mission-unavailable","message":"..."}`. Both shapes match `ServiceUnavailableBody`/the `ApiError` handling in `client.ts`, `useDiagnostics.ts`, and `MissionSection.tsx`.
  - Restarted Python: `GET /api/diagnostics/current` → `200` again (recovery confirmed).
  - Full `POST /api/mission/what-if` round trip with the exact request shape `MissionSection` sends → real baseline/scenario/delta/interpretation data returned, matches `WhatIfResult` type.
- `grep -rn "mock\|dummy\|Math.random\|setTimeout" frontend/src/` → no matches (no fake data anywhere in the frontend).
- `grep -rn "\.timestamp" frontend/src/` → no matches (confirms BUG-3 does not affect this UI).
- Java: `mvnw test` re-run this session → 21/21 pass, `BUILD SUCCESS` (no backend files changed; run to confirm nothing regressed from having both services live-restarted repeatedly).
- `git status`/`git add --dry-run frontend/` → exactly the 27 expected source files staged, `node_modules/` and `dist/` correctly excluded by `frontend/.gitignore`; no backend/python files modified this session beyond what session 1 already changed.

Remaining:
- No real-browser visual QA performed (no browser-automation tool available in this environment) — data-layer correctness is verified, pixel-level rendering is not.
- Only the NORMAL/healthy condition was observed live through the full stack this session; the 4 fault scenarios are backend-verified (unit tests, §6) but not yet UI-verified.
- BUG-3 (WS timestamp serialization) documented, not fixed — doesn't affect this frontend, deferred as P2.

### 2026-09-09 — P1 fault-scenario validation (session 3)

Status: COMPLETE

Changes:
- Established, from source, the exact live fault-injection ceiling: `HealthyEngineSimulator` (the live telemetry source behind `/api/diagnostics/current`) has no fault-injection capability and no endpoint exists to configure one; `mission_simulator.py`'s `fault_type` parameter is the only live, frontend-reachable fault-conditioning path, and it computes a self-contained degradation trajectory, not real telemetry/residuals/anomaly/classification.
- Added a fault-condition selector (`<select>`: NORMAL/Injector/Lubrication/Misfire/Sensor Drift) to `MissionSection.tsx`'s "Run Mission Simulation" panel (wired to `MissionSimulationRequest.faultType`) and "What-If" panel (wired to `WhatIfScenario.faultTypeOverride`, baseline left healthy so the delta isolates the fault's effect). Surfaced `finalComponentDegradation` (worst component) and `sensorObservabilityRisk` in both result summaries — the two fields that make the physical-vs-sensor distinction visible. No backend files changed; no new request fields — only existing, already-documented DTO fields that previously had no UI control.
- Re-ran `scripts/replay_rul.py` against session 1's existing fault-injected CSVs (`data/generated/{injector_degradation,lubrication_degradation,misfire,sensor_drift}.csv`) to get real offline evidence of the full health/degradation/RUL chain per scenario, using the actual `health_calculator.evaluate_health` / `degradation_estimator.estimate_degradation`/`estimate_rul` functions.
- Wrote the full validation record: §15.1 (per-scenario Trigger/Evidence/Expected/Actual/Result/Issues, plus a summary table).

Files:
- `frontend/src/components/MissionSection.tsx` (fault selector, result fields)
- `frontend/src/styles/index.css` (minimal `<select>` styling to match the existing controls)
- (No backend or physics-service files changed. No other frontend files changed.)

Verification:
- `npm run build` (`tsc && vite build`) after the change → **PASS**, 0 TypeScript errors, 169.68kB JS (gzip 52.65kB) / 9.91kB CSS (gzip 2.48kB).
- Live stack (Java :8080, Python :8000): `GET /api/diagnostics/current` polled 5× over 10s → `diagnosticType=NORMAL`/`predictedFault=NORMAL` every time, confirming the live chain cannot produce a fault state (this is the evidence behind "BLOCKED", not an assumption).
- `POST /api/mission/simulate` with `{"faultType": X}` for `X` in all 4 fault types, plus a no-fault baseline → 5/5 `200`, each producing a distinct, correctly-attributed `finalComponentDegradation`/`riskBand`/`operatorRecommendation` (full values in §15.1).
- `POST /api/mission/what-if` with `scenario.faultTypeOverride=X` for all 4 fault types (baseline healthy, scenario faulted) → 4/4 `200`, deltas correctly isolate each fault's effect (physical faults: Δrisk +0.30 to +0.37, Δhealth −7.9 to −10.0; sensor drift: Δrisk +0.01, Δhealth −0.37).
- `scripts/replay_rul.py --input-dir data/generated --output-dir data/generated/rul` → ran clean, per-scenario summary JSON + per-sample CSVs produced; sampled trajectories at t=60/130/180/250/295s for all 4 scenarios (full values in §15.1) confirm onset timing, `diagnosticType` transitions, `dominantMechanism` attribution, and honest RUL status behavior (including the sensor-drift isolation-latency nuance).
- Java: `mvnw test` — not re-run this session (no Java files changed); last confirmed 21/21 pass in session 2, git status confirms those files are unchanged since.
- `git status --short` → only `frontend/` (untracked, containing this session's `MissionSection.tsx`/`index.css` changes plus the unchanged session-2 files) and the pending `AEROTWIN_PROJECT_MASTER.md` update; the 5 backend files modified in session 1 remain modified but untouched this session. No unrelated files.

Remaining:
- The primary digital-twin panel chain (Telemetry/Twin/Diagnosis/Health/Sensor-Isolation/Degradation-RUL) still cannot show any fault scenario live — this is a structural gap requiring a deliberate backend design decision (new P1 item, §17), not something this session could or should have patched around.
- Real-browser visual QA still outstanding — same limitation as session 2, no browser-automation tool available.
- Sensor-drift isolation-latency nuance (§15.1) documented, not investigated further — not a bug, low urgency given the live chain can't demonstrate it anyway.

### 2026-09-09 — P1 live fault injection into the primary diagnostics chain (session 4)

Status: COMPLETE (capability); PARTIAL (diagnosis correctness under live faults, root-caused not fixed)

Changes:
- New physics-service endpoint `POST /simulation/inject-fault` — a thin wrapper around the existing, unmodified `FAULT_MODELS`/`FaultSchedule` (`app/simulation/fault_models.py`). Zero fault semantics reimplemented.
- New Java `FaultType` enum, `FaultControlRequest`/`SimulatorFaultState` DTOs, `FaultInjectionServiceClient` (mirrors the existing `*ServiceClient` pattern), `SimulatorController` exposing `GET`/`POST /api/simulator/fault`.
- `SimulationState` gained fault-control fields and an activation-relative elapsed-fault clock; `SimulationService.tick()` now routes through fault injection when active, with a tested fallback to healthy telemetry if the injection call fails (protects the `ScheduledExecutorService`-based 1Hz loop from silent permanent cancellation on an uncaught exception).
- `DiagnosticService.resetHistory()` (new) — called on every fault activation/reset so degradation/RUL trends don't blend before/after samples.
- New frontend `SimulatorControlPanel.tsx` (live simulator fault control, distinct from Mission's hypothetical fault selector) wired into `App.tsx`.
- 8 new Python tests (`test_simulation.py`), 17 new Java tests (`SimulationStateFaultTest`, `FaultInjectionServiceClientTest`, `SimulationServiceTest`, `SimulatorControllerTest`).

Files:
- `physics-service/api/routes/simulation.py` (new), `physics-service/main.py` (router registration), `physics-service/tests/test_simulation.py` (new)
- `backend/src/main/java/com/aerotwin/model/{FaultType,FaultControlRequest,SimulatorFaultState}.java` (new)
- `backend/src/main/java/com/aerotwin/service/FaultInjectionServiceClient.java` (new)
- `backend/src/main/java/com/aerotwin/controller/SimulatorController.java` (new)
- `backend/src/main/java/com/aerotwin/simulator/SimulationState.java`, `backend/src/main/java/com/aerotwin/service/{SimulationService,DiagnosticService}.java` (modified)
- `backend/src/test/java/com/aerotwin/simulator/SimulationStateFaultTest.java`, `backend/src/test/java/com/aerotwin/service/{FaultInjectionServiceClientTest,SimulationServiceTest}.java`, `backend/src/test/java/com/aerotwin/controller/SimulatorControllerTest.java` (new)
- `frontend/src/components/SimulatorControlPanel.tsx` (new), `frontend/src/api/{types,client}.ts`, `frontend/src/App.tsx` (modified)
- (No physics/ML/health/degradation/mission algorithm files changed.)

Verification:
- Python: `pytest -q` → 64/64 pass (56 pre-existing + 8 new).
- Java: `mvnw test` → 38/38 pass (21 pre-existing + 17 new), `BUILD SUCCESS`.
- Frontend: `npm run build` → 0 TypeScript errors.
- Live, against the real running stack, for all 5 scenarios (real ~120s onset waits, not shortcut) — full detail in §15.3. Summary: telemetry/physics/residual stages PASS for all 4 faults; diagnosis stage PASSes for Lubrication Degradation (mostly), FAILs its acceptance criterion for Injector Degradation and Misfire (root-caused to FINDING-1), and Sensor Drift's isolation didn't trigger in the 340s window tested (root-caused to FINDING-3) while its core safety property (no fabricated catastrophic diagnosis) held throughout.
- Confirmed NORMAL is byte-for-byte unchanged: `SimulationServiceTest.normalStateNeverCallsFaultInjectionService` asserts zero interaction with the injection client when inactive; live default state on fresh boot confirmed `{"faultType":"NORMAL",...,"active":false}`.
- `git status --short` reviewed — only the files listed above (plus the pending master-file update) changed; no physics/ML/health/degradation/mission files touched.

Remaining:
- FINDING-1 (`/ml/analyze` gets no history live) is the most likely root cause of the diagnosis-stage failures and is now the top P1 candidate (§17) — not fixed this session, flagged as its own architectural task.
- FINDING-3 (sensor-drift isolation doesn't handle simultaneous multi-channel drift) not fixed — flagged as P2, dependent on FINDING-1 being addressed first for a clean re-evaluation.
- BUG-3 (WS timestamp serialization), mission-boundary history isolation, environment-specific backend config, `backend/target/` cleanup, and real-browser visual QA all remain open from prior sessions.

### 2026-09-09 — P1 wire real diagnostic history into `/ml/analyze` (session 5)

Status: COMPLETE (fix); PARTIAL (diagnosis correctness for 2 of 4 fault scenarios — root cause now identified, not fixed)

Changes:
- `MLServiceClient.analyze(TwinSnapshot, List<DiagnosticSnapshot>)` — new signature, flattens each history sample's telemetry/prediction/residuals into the flat feature-row shape `/ml/analyze`'s `history: list[dict]` requires, via the Spring-managed `ObjectMapper` (constructor-injected, avoiding the BUG-3 anti-pattern). Includes `runId` on every row (a real bug found and fixed during live verification — see below).
- `DiagnosticService.getCurrentDiagnostics()` — call site updated to pass `new ArrayList<>(history)`, mirroring the existing `healthServiceClient.evaluate`/`degradationServiceClient.evaluate` pattern exactly.
- New Java tests: `MLServiceClientTest` additions (empty-history shape, flat-not-nested history rows, `runId` presence regression), new `DiagnosticServiceTest` (call-ordering: current tick never appears in its own history; `resetHistory()` behavior).
- New Python tests: `test_ml_history_integration.py` — using the real trained `data/models/` artifacts and the real offline dataset generator, proves history measurably changes the anomaly score and that rolling `_slope_5`/`_rollingStd_5` features are non-degenerate with real history vs. provably zero with empty history.
- No physics/ML/health/degradation/mission algorithm files changed. Temporary debug instrumentation was added to `physics-service/api/routes/ml.py` and `app/ml/inference.py` during live verification and fully removed before completion (confirmed via `git diff` showing no residual change to either file).

Files:
- `backend/src/main/java/com/aerotwin/service/MLServiceClient.java` (rewritten: new signature, flattening logic, `ObjectMapper` injection)
- `backend/src/main/java/com/aerotwin/service/DiagnosticService.java` (call site updated)
- `backend/src/test/java/com/aerotwin/service/MLServiceClientTest.java` (updated + new tests)
- `backend/src/test/java/com/aerotwin/service/DiagnosticServiceTest.java` (new)
- `physics-service/tests/test_ml_history_integration.py` (new)

Verification:
- Java: `mvnw test` → 43/43 pass, `BUILD SUCCESS` (38 pre-existing + 5 new/changed).
- Python: `pytest -q` → 66/66 pass (64 pre-existing + 2 new).
- Frontend: `npm run build` → 0 errors (no frontend files touched this session).
- Direct-contract verification: temporary request-body instrumentation confirmed `historyLen` growing correctly tick-over-tick and each row correctly flat (not nested) — caught a real bug (missing `runId` per history row causing a live `500`) via this exact process, fixed it, then removed all instrumentation.
- Behavioral verification, live, all 5 scenarios, same rigor as session 4 (real ~120s onset waits): NORMAL unaffected; Injector Degradation unchanged (tested both fixed-severity and full natural ramp); Lubrication Degradation unchanged/borderline (score clustered at the 0.6124 threshold); **Misfire measurably improved** (0/8 → 6/12 anomaly detections, including 3 consecutive correct `MISFIRE` results); Sensor Drift unchanged as expected (its blocker is unrelated to ML history, per FINDING-3). Full before/after table in §15.4.
- Root-caused the non-improving scenarios via a controlled comparison (not left unexplained): FINDING-4 (§8) — a physics-model divergence between Java's live `HealthyEngineSimulator` and Python's offline healthy-telemetry generator, confirmed by ruling out `missionPhase` and operating-point as explanations via direct swap tests.
- Regression sweep: `mission/simulate`, `mission/what-if`, `WS /ws/telemetry` all re-verified live, no regressions.
- `git status --short` reviewed — exactly the files listed above changed, plus the pending master-file update; no unrelated files, no leftover debug code.

Remaining:
- FINDING-4 (live/offline healthy-engine-model divergence) is now the top P1 candidate — a substantial, separate architectural task, not started.
- FINDING-3 (sensor-drift multi-channel isolation) still open, confirmed unaffected by this session's fix.
- Lubrication Degradation's borderline threshold behavior noted but not investigated further this session (premature while FINDING-4 is still open).
- BUG-3, mission-boundary history isolation, environment-specific backend config, `backend/target/` cleanup, and real-browser visual QA all remain open from prior sessions.

### 2026-09-09 — P1 FINDING-4 investigation: architecture/scoping session, no implementation (session 6)

Status: COMPLETE (investigation); NOT STARTED (implementation, by design)

Changes:
- No code changed. This was explicitly an evidence-gathering and architecture-decision session per the task's own instruction ("Do NOT implement immediately... this session is first an architecture/scoping and evidence session").
- Mapped every relevant Java (`HealthyEngineSimulator.java`) and Python (`app/physics/{engine_model,combustion,thermal,airflow,environment}.py`, `app/simulation/mission_generator.py`) telemetry-generation formula field-by-field.
- Discovered and confirmed the precise root cause: the offline/training healthy-telemetry generator has no independent physics — it calls the same `predict_healthy_state()` function `/physics/predict` exposes and copies its output, making training-data healthy residuals exactly zero by construction (verified against the actual `healthy_missions.csv`: mean/std/min/max = 0.0 across all 7 residual columns, every row). Java's `HealthyEngineSimulator` has independent, structurally different formulas (missing mission-phase RPM correction, missing throttle/load EGT terms, different CHT/oil-temperature filter response rates), producing a permanent, nonzero "baseline residual gap" at live healthy operation.
- Quantitatively confirmed via hand-calculation cross-checked against a fresh live capture: predicted rpmResidual +100.0 vs. observed +94.6 to +109.1; predicted egtResidual −49.8 vs. observed −47.4 to −54.9 (both channels matched within single-digit percentage error); all 7 channels checked.
- Directly compared the offline vs. live Injector Degradation residual vectors and found the exact divergence: the RPM residual **flips sign** (offline ≈ −88.7, live ≈ +23.8) because the live baseline gap (+100) partially cancels the fault's own effect (−72 at severity 0.9) — the live vector is structurally different from, not just noisier than, what the classifier was trained on.
- Evaluated 4 architecture options (A: duplicate formulas in Java; B: unify on Python's physics as the single source of truth, reusing the existing session-4 fault-injection path; C: retrain on Java-sourced data; D: add a drift-detection regression test as a complement) and recommended Option B with explicit reasoning grounded in the codebase's existing architecture (Python already owns every other domain algorithm).
- Wrote a concrete verification plan and files-affected/files-untouched lists for the next (implementation) session, and explicitly flagged unresolved design questions (Python-unavailable fallback behavior for live telemetry; noise-term retention) rather than assuming answers.

Files:
- None (investigation only). `AEROTWIN_PROJECT_MASTER.md` updated (§8 FINDING-4 expanded, new §15.5, §17, §18, §19).

Verification:
- `git status --short` before and after this session's work — confirmed identical except for the master-file update; zero source files touched.
- All quantitative claims backed by either a direct source-code read, a hand-calculation whose result was cross-checked against fresh live data, or a direct read of committed training-data statistics — none asserted from memory or inference alone.

Remaining:
- Option B is a recommendation, not a proven fix — the next session must implement it and then measure the real effect on live classification, exactly as sessions 4 and 5 measured rather than assumed their own changes' effects.
- The Python-unavailable fallback behavior for live telemetry generation is an open design question, not yet decided.
- FINDING-3 (sensor-drift multi-channel isolation), BUG-3, mission-boundary history isolation, environment-specific backend config, `backend/target/` cleanup, and real-browser visual QA all remain open from prior sessions, untouched by this one.

### 2026-09-09 — P1 FINDING-4 implementation: Option B (session 7)

Status: **RESOLVED** (FINDING-4). Separate, pre-existing anomaly-threshold-gate limitation remains, reported honestly, not part of this fix's scope.

Changes:
- `HealthyEngineSimulator` rewritten to delegate to `PhysicsServiceClient.predict()` — the same canonical physics model the offline dataset generator uses — instead of independent reduced-order formulas. Threads CHT/oil-temperature state forward across ticks, mirroring the offline generator's own `previous.model_copy()` pattern.
- `EngineSimulator` gained an `isHealthyBaselineFresh()` default method; `SimulatorFaultState` gained a `healthyBaselineFresh` field, surfaced via the existing `/api/simulator/fault` endpoint.
- Python-unavailable fallback: freezes the last successfully-computed healthy telemetry (never fabricates new independent physics), with a one-time cold-start bootstrap matching the offline generator's own seed values if Python has never once succeeded.
- `SimulationService.tick()` and `FaultInjectionServiceClient` are structurally unchanged — the new healthy-baseline source slots into the exact same fault-injection call site that already existed.
- No physics-service Python files, fault models, ML code/artifacts, health/degradation/RUL logic, mission logic, or the offline dataset generator were touched.

Files:
- `backend/src/main/java/com/aerotwin/simulator/HealthyEngineSimulator.java` (full rewrite)
- `backend/src/main/java/com/aerotwin/simulator/EngineSimulator.java` (new default method)
- `backend/src/main/java/com/aerotwin/model/SimulatorFaultState.java` (new field)
- `backend/src/main/java/com/aerotwin/service/SimulationService.java` (one line, sources the new field)
- `backend/src/test/java/com/aerotwin/simulator/HealthyEngineSimulatorTest.java` (full rewrite)
- `backend/src/test/java/com/aerotwin/controller/SimulatorControllerTest.java`, `backend/src/test/java/com/aerotwin/service/SimulationServiceTest.java` (updated for the new field, one new test each)

Verification:
- Java: `mvnw test` → 48/48 pass, `BUILD SUCCESS`.
- Python: `pytest -q` → 66/66 pass, unchanged.
- Frontend: `npm run build` → 0 errors, unchanged.
- **Healthy baseline (primary falsification test):** 20 live NORMAL samples — rpm/egt/fuelFlow/vibration residuals exactly `0.0000` (mean/std/min/max); cht/oilTemperature converge monotonically from ~−0.5/−0.7 to ~−0.02/−0.20 within 35s; oilPressure's small residual (+0.13 mean) fully explained as a downstream consequence of oilTemperature's convergence.
- **Physics equivalence:** direct Java-vs-Python comparison at matched context → `rpm: 4550.003004` both sides, `egt: 962.332907` both sides — exact to 6 decimal places, by construction (same function call).
- **Injector Degradation, real classifier output (not hand-constructed):** `INJECTOR_DEGRADATION: 0.9779` (pre-fix: ~0.05-0.22, `SENSOR_DRIFT`-dominant). RPM residual sign corrected (−80.1, was +23.8 pre-fix; offline training signature −88.7).
- **Lubrication Degradation:** classifier confidence 0.980-0.981 across 8/8 consecutive live polls (pre-fix: threshold-clustered, inconsistent).
- **Misfire:** classifier confidence 0.973-0.979 across 8/8 consecutive live polls (pre-fix: real but much less consistent).
- **Sensor Drift:** classifier confidence 0.979-0.982; isolation gap confirmed unaffected (as predicted, independent issue); core safety property (no fabricated catastrophic diagnosis) held across a ~313s live run.
- **Fallback:** Python killed mid-session — `healthyBaselineFresh` correctly flipped to `false`, `/api/telemetry/current` stayed available with frozen values and an advancing timestamp, `/api/twin/current` correctly still `503`'d (a separate, unaffected, pre-existing dependency). Restarted Python — automatic recovery confirmed, no manual intervention needed.
- **Regression sweep:** `mission/simulate`, `mission/what-if`, `WS /ws/telemetry` all re-verified live and unaffected.
- `git status --short` reviewed — exactly the files listed above changed, plus the master-file update; no unrelated files.

Remaining:
- The anomaly-detector threshold gate (Isolation Forest, 0.6124 threshold) is now the singular, cleanly-isolated remaining blocker for a fully correct live diagnosis — new top P1 candidate (§17), explicitly separate from and pre-dating FINDING-4.
- FINDING-3 (sensor-drift multi-channel isolation) confirmed still open and independent of both this fix and session 5's.
- CHT/oil-temperature's convergent-but-nonzero residual behavior is understood and bounded, not a defect.
- BUG-3, mission-boundary history isolation, environment-specific backend config, `backend/target/` cleanup, and real-browser visual QA all remain open from prior sessions.

### 2026-09-09/2026-09-10 — P1 anomaly-gate investigation, no threshold change (session 8)

Status: **INVESTIGATION COMPLETE.** Decision: no threshold value change warranted. New finding (FINDING-5) identified and documented, not root-caused. Regression tests added. This was explicitly an investigation/calibration session, not an implementation session.

Changes:
- `physics-service/app/ml/training.py` — one-line metadata-string fix: `thresholdSelection` now correctly says "train-split" instead of the previously-incorrect "validation." Does not change the threshold value or require retraining; only affects the string a future training run writes to `evaluation_metrics.json`.
- `physics-service/tests/test_anomaly_detector.py` — new file, 7 tests (predict boundary/separation behavior on a stub model, `fit()` healthy-FPR calibration band, far-outlier scoring, save/load round-trip, real-artifact healthy-FPR bound, real-artifact AUC floor). Closes a pre-existing zero-coverage gap. Deliberately non-brittle: bands/margins, not exact floats.
- **No threshold value changed. No hardcoding of classifier confidence or fault-type into the anomaly gate. No model retrained. No other files touched.**

Files:
- `physics-service/app/ml/training.py` (one-line string fix)
- `physics-service/tests/test_anomaly_detector.py` (new)

Verification:
- Python: `pytest -q` → 73 collected, 66 pass (59 pre-existing + 7 new), 7 pre-existing errors (missing `xgboost` module in this environment) confirmed unrelated to this session's changes via `git stash`/`git stash pop` A/B comparison — identical 7 errors present with and without this session's diff.
- Java/frontend: not touched, not re-run this session (no Java or frontend files modified).
- **Offline separability re-measured:** AUC-ROC validation 0.593, test 0.598 (near chance); a full 99th→50th percentile threshold sweep confirmed no percentile choice buys materially better recall without a disproportionate healthy-FPR cost.
- **Offline per-fault-type sustained crossing rate (post-onset, severity>=0.8):** all four fault types land at 4.3-23.5%, statistically close to the 4-6% healthy false-positive rate — separability is weak and uniform, not concentrated in specific fault types.
- **Live evidence:** 47 samples across NORMAL + 4 faults, each tracked several minutes past onset. Lubrication (4/4) and Misfire (3/3) cross the gate reliably; Injector (0/15) and Sensor Drift (0/6) never do.
- **Decisive matched-parameter check:** offline-regenerating the Lubrication Degradation scenario with the live run's exact severity (0.9) and onset timing (120s) produced post-onset scores of 0.49-0.57 — never crossing 0.6124 — a completely different result from the live run's 0.637-0.648 on the same scenario. This is the core evidence for FINDING-5: the live "success" for Lubrication/Misfire is not something the offline-trained model's own evaluation predicts.
- Reset the live simulator to `NORMAL` after data collection; confirmed inactive state.
- `git status`/`git diff` reviewed — only `training.py` (one line) and the new test file changed, plus the master-file update.

Remaining:
- **FINDING-5 (new, P1, §8):** live anomaly scores for Lubrication Degradation and Misfire run meaningfully higher than the offline-trained model predicts for the same parameters — root-caused later this same session (§15.8, see the following work-log entry), not fixed.
- The anomaly detector's inherently weak offline separability (AUC~0.59, uniform across fault types) remains a model-class limitation, not something a same-session fix can address.
- Sensor Drift's non-detection is unchanged and expected (§15.3/§15.6) — not an open item from this session.

### 2026-09-10 — FINDING-5 root-cause investigation, no fix applied (session 8 continued)

Status: **ROOT CAUSE IDENTIFIED**, evidenced with controlled experiments and direct feature-level data. **Not fixed** — explicitly an investigation session; the recommended fix is scoped but deliberately not implemented.

Changes:
- `physics-service/app/ml/inference.py` — temporary, env-var-gated feature-vector debug dump added to `analyze()`, used to capture exact named feature vectors for live vs. offline comparison, then **fully removed** — confirmed via `git diff` showing zero residual change to the file.
- `pip install xgboost shap` for the native Windows Python interpreter — routine environment maintenance (both were missing, causing 7 pre-existing test errors already noted in §15.7); not a code change. Full suite is now 73/73 passing, 0 errors.
- **No other files changed. No threshold, classifier, fault model, health/degradation/RUL, mission, or frontend code touched.**

Investigation performed (full detail in §15.8):
- Traced the exact feature pipeline: confirmed `build_live_features()` calls the identical `build_features()` training uses — no separate live code path, so divergence must be in the data fed in, not the transformation logic.
- Found `DiagnosticService.getCurrentDiagnostics()` (which builds the ML `history` buffer) runs synchronously per REST poll, decoupled from the existing 1Hz `SimulationService` scheduler — a structural mismatch with the model's `temporal_window=5`/offline `sample_rate_hz=1.0` design assumption (5 samples = 5 seconds).
- **Decisive controlled experiment:** re-ran Lubrication Degradation at true 1Hz polling cadence (matching offline) instead of the original ~12-13s ad hoc cadence. Steady post-onset score dropped from a persistent 0.637-0.648 to 0.60-0.61 (right at the 0.6124 threshold) — a single-variable (cadence-only) causal demonstration.
- Ran the same 1Hz protocol as controls on Injector Degradation (unaffected, stays below threshold at any cadence), Misfire (partially affected — its own designed-in per-tick randomness keeps it noisy even at 1Hz, landing close to its offline crossing rate), and Sensor Drift (unaffected — its fault model has no step onset to straddle).
- Captured real feature vectors live (via the temporary instrument) and compared to matched offline rows: found live's context-driven channels (rpm/egt/fuelFlow/oilPressure) have *exactly zero* rolling std/slope on every tick (a side effect of FINDING-4's fix querying `/physics/predict` at one permanently fixed operating point), while offline has real non-zero per-tick noise on the same channels.
- Confirmed from source that `missionPhase_IDLE` (a one-hot feature) is `1` for every live sample and `0` for every training row — `SimulationState` never varies mission phase live; the offline generator's 6 mission archetypes never include `IDLE`.
- Evaluated Options A-E for addressing the finding; recommended Option A narrowly scoped to the history-sampling cadence (highest effect size, lowest blast radius, doesn't touch ML models or the threshold); documented the noise-model and mission-phase gaps as smaller, separate, out-of-scope-for-this-session follow-ups.

Files:
- `physics-service/app/ml/inference.py` (temporary instrumentation added and fully removed — zero net diff)

Verification:
- Python: `pytest -q` → 73/73 passing, 0 errors (up from 66/73 passing, 7 errors, after installing the missing `xgboost`/`shap` dependencies).
- `git diff -- physics-service/app/ml/inference.py` → empty, confirming the temporary debug instrument left no trace.
- Reset the live simulator to `NORMAL` after each experiment; confirmed inactive state.
- `git status` reviewed — only the master-file update remains as a net change from this entry (the debug instrument was added and removed within the same session).

Remaining:
- **The recommended fix (move `DiagnosticService`'s history population onto the existing 1Hz scheduler) is not implemented** — scoped in §15.8 for a future session, with an explicit verification plan (re-run this session's exact A/B protocol post-fix).
- Two smaller, secondary FINDING-5 contributors (zero live telemetry noise; permanent `missionPhase="IDLE"`) are documented but not fixed — each has broader blast radius (touches `SimulationState`/`HealthyEngineSimulator`) and needs its own scoped session.
- Do not implement the recommended fix without first re-reading §15.8's "what must NOT change" list.
- FINDING-3 (sensor-drift multi-channel isolation), BUG-3, mission-boundary history isolation, environment-specific backend config, `backend/target/` cleanup, and real-browser visual QA all remain open from prior sessions, untouched by this one.

### 2026-09-10 — FINDING-5 implementation: history-cadence fix (session 8 continued)

Status: **PARTIALLY RESOLVED.** The primary, largest-effect contributor (REST-poll-driven history sampling) is fixed and verified. Two secondary contributors (§15.8) remain, explicitly not addressed, documented separately.

Changes:
- `DiagnosticService.java` split into `tick()` (computes + appends to history, catches downstream-unavailable failures internally) and `getCurrentDiagnostics()` (read-only, bootstraps once if never ticked, re-throws a stored failure to preserve exact existing 503 behavior). `resetHistory()` and `tick()`'s history mutation synchronized on `history` (a positive side effect: eliminates a pre-existing latent race between concurrent REST threads, since only the single-threaded scheduler and `resetHistory()` now touch it).
- `TelemetryWebSocketHandler.java` — constructor now also takes `DiagnosticService` (Spring autowires it automatically); `broadcastTelemetry()` calls `diagnosticService.tick()` right after `simulationService.tick()`, unconditionally, on the existing 1Hz scheduler. Minor simplification: consolidated the duplicate `simulationService.tick()` call that existed in both branches into one call at the top.
- `DiagnosticServiceTest.java` rewritten: 3 existing tests updated to call `tick()` (the correct method now) instead of `getCurrentDiagnostics()`; 4 new tests added covering the specific regression risks the task called out (repeated reads never mutate history/recompute; bootstrap-once-if-never-ticked; a failed tick appends nothing and re-throws the same exception object; automatic recovery on the next successful tick).
- No Python files, threshold, classifier, fault models, health/degradation/RUL, mission logic, frontend, or `/api/simulator/fault` touched.

Files:
- `backend/src/main/java/com/aerotwin/service/DiagnosticService.java`
- `backend/src/main/java/com/aerotwin/controller/TelemetryWebSocketHandler.java`
- `backend/src/test/java/com/aerotwin/service/DiagnosticServiceTest.java`

Verification:
- Java: `mvnw test` → 52/52 pass, `BUILD SUCCESS`.
- Python: `pytest -q` → 73/73 pass, unchanged (a temporary debug instrument was added to `inference.py` to capture live history timestamps for evidence, then fully removed — `git diff` confirms zero residual change).
- Frontend: `npm run build` → 0 errors, unchanged.
- **History cadence (Test 1):** 101 samples over 100.01s with zero REST polling during the window — mean interval 1.0001s, min 0.9519s, max 1.0510s. History length grows by exactly +1 per tick, capped correctly at 60, chronologically ordered.
- **Poll independence (Test 2/8):** 97 REST polls to `/api/diagnostics/current` across four rate patterns (~1Hz, ~5Hz, ~0.1Hz, and 3 bursts of 10 concurrent simultaneous clients) — zero effect on history growth, which stayed at exactly 1.0000s mean interval throughout.
- **NORMAL (Test 3):** all 7 residual + 7 normalized-residual channels exactly 0.0000; anomaly score 0.5458, `anomaly=false`, no false positive.
- **Lubrication (Test 4), the headline result:** slow (12-13s) cadence post-fix now produces 0.6076/0.6017/0.6056/0.6037 (t=124-161s) — matching the 1Hz result (0.60-0.61 steady state) almost exactly, a complete reversal from the pre-fix divergence (persistent 0.637-0.648 at slow cadence vs. 0.60-0.61 at 1Hz).
- **Misfire (Test 5):** 1Hz post-fix, 23/70≈32.9% crossing rate — consistent with the pre-fix 1Hz result (~31%), confirming Misfire's own designed-in per-tick randomness (not cadence) governs its behavior.
- **Injector (Test 6):** unchanged — 0.55-0.56 plateau, 97.8% classifier confidence, never crosses.
- **Sensor Drift (Test 7):** unchanged — ~0.54 plateau, 97.9% classifier confidence, never crosses; FINDING-3 untouched.
- Reset the live simulator to `NORMAL` after all testing.
- `git status`/`git diff` reviewed — only the two intended Java files changed, plus the already-untracked test file's rewrite and this master-file update; the temporary Python debug instrument left zero trace.

Remaining:
- **FINDING-5 is partially, not fully, resolved.** Two secondary contributors remain, documented in §15.8/§15.9/§17: live context-driven telemetry has exactly-zero per-tick noise (side effect of FINDING-4's fix), and `missionPhase_IDLE` is permanently 1 live vs. 0 in training. Neither was in scope for this task.
- FINDING-3 (sensor-drift multi-channel isolation), BUG-3, mission-boundary history isolation, environment-specific backend config, `backend/target/` cleanup, and real-browser visual QA all remain open, untouched by this task.

### 2026-09-10 — Overnight sprint: FINDING-5 secondary contributors closed, demo hardening, full SIH validation

Status: **FINDING-5's two secondary contributors QUANTIFIED and CLOSED (decision C, document-only).** BUG-3 and a newly-found BUG-4 **FIXED and VERIFIED**. Full live fault-sequence and recovery re-validation performed. No architecture, model, threshold, or dependency changes — worked entirely within the explicit "tightly scoped, evidence-backed" authorization; nothing required stopping to ask.

Workstream 1 (§15.10): isolated both FINDING-5 secondary contributors via controlled ablation against the real trained `AnomalyDetector` (not live polling, which cannot separate confounded mechanisms) — zero-noise effect -0.0035 to +0.0094, mission-phase-IDLE effect <=0.03 across all 7 phases with IDLE trending *low* not high. Both negligible; decision C for both, no code changed. Honestly flagged a ~0.09-0.12 residual live/offline gap that neither contributor explains — not pursued further.

Workstream 2/3 (§15.11): discovered and started using the repo's existing, correctly-provisioned `.venv` (sklearn 1.9.0, matching the trained artifacts — eliminates the version-mismatch warnings every prior session saw). Found and fixed BUG-3 (WS timestamp, dormant since session 2) and a new bug, BUG-4 (sensor-isolation gate falsely labeling Injector/Misfire as `SENSOR_FAULT` whenever the anomaly gate hadn't crossed, even though the classifier itself was 97-98% confident) — both verified live, both regression-tested, BUG-4's test confirmed via `git stash` A/B to actually catch the bug. Fixed a stale README with no frontend/live-fault-injection/`.venv` instructions. Ran a full live `NORMAL -> fault -> NORMAL` sequence for all 4 faults with reset-integrity checks at every step, plus a fresh Python-unavailable recovery test (high-value given `DiagnosticService` was rewritten this session).

Changes:
- `backend/src/main/java/com/aerotwin/controller/TelemetryWebSocketHandler.java` — BUG-3 fix: `ObjectMapper` constructor-injected instead of hand-constructed.
- `physics-service/app/health/health_calculator.py` — BUG-4 fix: `model_supports_sensor_fault` now derived from `argmax(faultProbabilities)` instead of the anomaly-gated `predictedFault`.
- `physics-service/tests/test_health.py` — new regression test for BUG-4.
- `README.md` — new "Quick Start (current system, all phases)" section (frontend setup, `.venv` usage, live fault-injection endpoint, Windows commands); historical Phase 1-6 walkthrough left intact.

Verification:
- Python: `pytest -q` via `.venv` → 74/74 PASS, 1 harmless warning, zero version-mismatch warnings.
- Java: `mvnw test` → 52/52 PASS, BUILD SUCCESS.
- Frontend: `npm run build` → PASS, 0 errors.
- BUG-3: live Node `ws` client, 4 frames, `timestamp` now ISO-8601 (`typeof string`).
- BUG-4: live re-verification across all 4 fault types (Injector fixed, Misfire 0/10 misattributed, Lubrication/Sensor-Drift unchanged); regression test confirmed to fail pre-fix, pass post-fix.
- Full fault sequence: all 4 NORMAL reset checkpoints clean (residuals <=0.13 max-abs, health=100.00, RUL honestly `INSUFFICIENT_HISTORY`), no cross-scenario contamination.
- Backend recovery: fresh kill-python test, 503 propagation correct on all downstream-dependent endpoints, automatic recovery confirmed.
- Frontend source-level resilience audit: no browser automation tool available in this environment; reviewed `App.tsx`/`AlertBanner.tsx`/`DegradationRulPanel.tsx`/`MissionSection.tsx`/`useDiagnostics.ts`/`useTelemetryStream.ts` — no concrete bugs found, consistent null-handling and honest-unavailability patterns throughout.
- `git status`/`git diff` reviewed — only the 4 files listed above changed this sprint, on top of the already-established session-8 baseline; no unrelated files, no secrets, no generated-artifact contamination.

Remaining:
- FINDING-3 (sensor-drift multi-channel isolation) remains open, explicitly confirmed unaffected by BUG-4's fix.
- FINDING-5's two secondary contributors remain as documented, negligible, accepted limitations — not planned for further work absent new evidence.
- One pre-existing, minor, unchanged gap noted (not fixed, out of scope): `DiagnosticController` does not catch `DegradationServiceUnavailableException` (only the other 3 controllers do).
- Real-browser visual QA remains the single biggest confidence gap — no tool available in this environment.
- BUG-3/BUG-4/mission-boundary history isolation/environment-specific backend config/`backend/target/` cleanup: BUG-3 and BUG-4 now resolved; the rest remain open from prior sessions.

### 2026-09-10 — Final SIH demo readiness sprint: real-browser QA, full live E2E sweep, 2 bugs fixed

Status: **Real-browser QA performed for the first time this project (browser automation tooling was available this session) — the single biggest confidence gap named in every prior session is closed.** Full `NORMAL → fault → NORMAL` sweep re-run for all 4 faults with the dashboard open and watched live. Two small, isolated bugs found and fixed (AlertBanner wording; BUG-5, a missing exception catch). FINDING-3 and the Injector/Sensor-Drift anomaly-gate conservatism are explicitly NOT claimed resolved. No architecture, model, threshold, or dependency changes.

Full detail in §15.12. Headline: all 4 fault scenarios, NORMAL resets (×5), Mission Simulation, What-If, WebSocket, and Python-outage recovery were all visually confirmed working correctly in a real Chrome tab, with zero console errors observed across the entire sprint.

Changes:
- `frontend/src/components/AlertBanner.tsx` — headline no longer says "Engine nominal" when `health.status` isn't `HEALTHY`; now checks status alongside `diagnosticType`.
- `backend/src/main/java/com/aerotwin/controller/DiagnosticController.java` — BUG-5 fix: added the missing `catch (DegradationServiceUnavailableException ...)` block, mirroring `DegradationController`'s existing pattern.
- `backend/src/test/java/com/aerotwin/controller/DiagnosticControllerTest.java` — new regression test for BUG-5.
- `.gitignore` (new, repo root) — `backend/target/`, IDE folders, OS cruft.

Verification:
- Java: `mvnw test` → 53/53 PASS (52 pre-existing + 1 new), `BUILD SUCCESS`.
- Python: `pytest -q` via `.venv` → 74/74 PASS, unchanged.
- Frontend: `npm run build` → PASS, 0 errors.
- Live fault sweep: all 4 faults + 5 NORMAL checkpoints re-verified live and visually, matching §15.7-§15.11's documented figures exactly, no regressions.
- WebSocket: manually verified with Node's built-in `WebSocket` client (no new dependency added) — 5 frames, ~1.000s cadence, ISO-8601 timestamp confirmed.
- Backend recovery: killed Python live with the dashboard open — confirmed graceful `503`/"SERVICE UNAVAILABLE" rendering, zero console errors, then confirmed automatic recovery on Python restart with no Java restart and no manual frontend refresh needed.
- Final live sanity check: NORMAL → Lubrication Degradation (fault correctly detected and diagnosed) → NORMAL (clean reset) — see §15.12.
- `git status`/`git diff` reviewed — no secrets, no stray temp/debug files, no accidental artifacts beyond the already-known `backend/target/` tracking issue.

Remaining:
- FINDING-3 (sensor-drift multi-channel isolation) remains open — re-confirmed live and in-browser this sprint; behavior is graceful (no crash, no misleading certainty), not fixed.
- Injector Degradation's and Sensor Drift's anomaly gate remaining conservative (by design/evidence, §15.7) is unchanged — not attempted, not claimed fixed.
- `backend/target/` untracking (`git rm -r --cached`) is proposed, not executed — needs explicit user approval before the next session touches it.
- Environment-specific backend config, mission-boundary history isolation, and automated WebSocket/frontend test infrastructure all remain open, out of scope for this sprint by explicit instruction.

### 2026-09-10 — Repository hygiene: `backend/target/` untracked (approved cleanup)

Status: **DONE.** User reviewed the final demo-readiness audit, confirmed YELLOW readiness, and explicitly approved the one open engineering decision: untracking `backend/target/`. Executed exactly as scoped, nothing else touched.

Changes:
- `git rm -r --cached backend/target/` — 96 files removed from git's index. Local directory left untouched on disk (Maven still has its build output).

Verification:
- Java: `mvnw test` → 53/53 PASS, BUILD SUCCESS (unchanged).
- Python: `pytest -q` → 74/74 PASS (unchanged, untouched by this cleanup).
- Frontend: `npm run build` → PASS, 0 errors (unchanged, untouched by this cleanup).
- `git status`: 96 staged deletions, all under `backend/target/`; the same 21 legitimate modified source/test files from §15.12; the same legitimate untracked files plus `.gitignore` itself. No secrets, no temp files, no newly-tracked generated artifacts, no source files deleted, no unrelated files touched.
- Not committed — staged only, per the project's standing rule to commit only when explicitly asked.

Remaining: exactly what §15.12 already listed (FINDING-3 open, anomaly-gate conservatism by design, environment-specific backend config, mission-boundary history isolation, automated test infrastructure) — this cleanup changed none of them. **No further engineering work identified for the current SIH MVP scope.**

## 20. Known Technical Debt

- ~~`backend/target/` (~90 files) committed to git~~ — **RESOLVED (§15.13, approved and executed).** `git rm -r --cached backend/target/` run; 96 files untracked, `.gitignore` (added §15.12) now takes effect. Local directory untouched on disk, Maven unaffected, `mvnw test` still 53/53. Not yet committed (staged only — commits happen only when explicitly requested).
- No `application.yml`/`.properties` in the backend — all service URLs are `@Value` defaults pointing at `localhost:8000`. Fine for a single-machine prototype demo, will not survive a real multi-host deployment without changes.
- Root `.gitignore` added final sprint (§15.12) — covers `backend/target/`, IDE folders, OS cruft. `physics-service/.gitignore` and `frontend/.gitignore` already existed and are correct.
- No CI configuration of any kind.
- `data/generated/` and `data/models/` are correctly gitignored but that also means a fresh clone has **zero** trained models until someone runs `generate_dataset.py` + `app.ml.training` — this is expected/by design (README documents it) but worth remembering: `/ml/analyze` will 503 on a totally fresh clone until that's done.

## 21. SIH Demo Readiness

### Infrastructure
- [x] Python starts cleanly — **use `physics-service/.venv/Scripts/python.exe`** (a fully-provisioned venv already exists in the repo, `scikit-learn==1.9.0` matching the trained artifacts exactly — corrected overnight sprint, §15.11; sessions 1-8 used the native Windows interpreter instead, which works but has an older sklearn causing harmless `InconsistentVersionWarning`s on every model load)
- [x] Java starts cleanly (`mvnw spring-boot:run`; on this machine, `mvnw.cmd` via a native `cmd.exe /c` call through the Bash tool silently no-ops — use the PowerShell tool instead)
- [x] Frontend starts cleanly (`npm install && npm run dev`, verified session 2; needs `npm install` first on a fresh clone since `node_modules/` is correctly gitignored)
- [ ] Model artifacts present on fresh clone — **no, must run generate_dataset.py + training first (by design, documented in README; the README's Quick Start section added overnight-sprint now states this explicitly)**

**Environment note, corrected overnight sprint (2026-09-10):** this machine has three Python interpreters, but the correct one to use for this repo is neither of the two previously documented — it's `physics-service/.venv/`, which already exists, is gitignored, and is fully provisioned including `xgboost`/`shap`/`scikit-learn 1.9.0`. The MSYS2/mingw64 `python3` still cannot install this project's dependencies (unchanged finding). The native Windows Python at `AppData\Local\Programs\Python\Python312\python.exe` also works (used for sessions 1-8's live/test work) but is NOT the repo's own venv and has an older, mismatched `scikit-learn` (1.8.0 vs the artifacts' 1.9.0) — prefer `.venv` going forward.

### Live Monitoring
- [x] Telemetry updates (verified live, 1s cadence via WebSocket handler source; REST polling confirmed live; **now also confirmed rendering and updating in a real browser, final sprint §15.12**)
- [x] Physics predictions update (verified live)
- [x] Residuals update (verified live, signs correct)
- [x] Health updates (verified live)

### Fault Detection
(Updated overnight sprint 2026-09-10 — see §15.7-§15.11 for full evidence. **All 4 scenarios below were re-run live and re-confirmed in a real browser during the final SIH demo readiness sprint (§15.12, 2026-09-10) — figures and behavior below reproduced exactly, no regressions found.** "Primary chain" = live `/api/simulator/fault` → Telemetry/Twin/Diagnosis/Health/Sensor-Isolation/Degradation-RUL panels. "Mission chain" = the separate, independently-verified hypothetical what-if path from session 3. FINDING-4 is resolved; classifier confidence figures are the real trained model's output, not assumed. Anomaly-gate crossing behavior reflects the post-cadence-fix state (§15.9) — poll-rate-independent. `diagnosticType` figures reflect the post-BUG-4-fix state (§15.11) — Injector/Misfire no longer falsely show `SENSOR_FAULT`.)
- [x] Injector — telemetry/residuals correctly perturbed live, RPM residual sign correct (matching training). **Classifier confidence for the correct class: 97.6-97.8%.** Anomaly gate does NOT cross live (score plateaus 0.55-0.58, threshold 0.6124), so `predictedFault` stays `NORMAL`. `diagnosticType` correctly shows `NORMAL` (was incorrectly `SENSOR_FAULT` pre-BUG-4-fix) — no longer claims a misleading sensor-fault diagnosis for this physical fault. Mission chain: live-verified correctly (session 3).
- [x] Lubrication — telemetry/residuals correctly perturbed live. **Classifier confidence 98.1-98.7%.** Anomaly gate crosses reliably live, ~0.60-0.61 steady state, poll-rate-independent (§15.9). `diagnosticType=NORMAL`, unaffected by BUG-4's fix (was already correct). A smaller, secondary live/offline gap remains (offline matched-scenario score ~0.49-0.57) — attributed to two contributors that were quantified and found negligible (§15.10), not the dominant explanation. RUL honestly withheld throughout.
- [x] Misfire — probabilistic per-tick alternation directly observed live. **Classifier confidence 96.8-97.9%.** Anomaly gate crosses ~33% of post-onset ticks at 1Hz, its own per-tick randomness dominates. `diagnosticType` now correctly alternates between `PHYSICAL_FAULT`/`MISFIRE` (when the gate crosses) and `NORMAL` (when it doesn't) — 0/10 samples showed the pre-fix `SENSOR_FAULT` misattribution in the post-fix re-verification.
- [x] Sensor drift — telemetry correctly perturbed; core safety property held. **Classifier confidence 97.9-98.2%.** Anomaly gate does NOT cross live (score plateaus ~0.54). `diagnosticType=NORMAL` — **unchanged by BUG-4's fix**, confirming that fix does not touch FINDING-3 at all. Isolation still does not transition to `SENSOR_FAULT` for this fault specifically — confirmed still open, consistent with FINDING-3 being a genuinely independent `health_calculator` multi-channel issue. Mission chain: live-verified (session 3).

### AI
- [x] Anomaly score (present in every live `/api/diagnostics/current` response)
- [x] Fault probability (present, verified live)
- [x] Explainability (implemented, gated on anomaly=true, rarely populated live due to low recall — see §9)

### Prediction
- [x] Degradation (verified live, correct low-confidence/INSUFFICIENT_HISTORY behavior)
- [x] RUL (verified live, correctly withholds fabricated estimates)
- [x] Confidence (present on both)

### Mission
- [x] Mission simulation (verified live)
- [x] What-if (verified live)
- [x] Mission reliability (verified live, real risk/reliability scores)
- [x] Mission replay — offline script only, verified via tests, not wired to any live UI (no UI exists)

### UI
- [x] No fake data — verified, `grep` for mock/dummy/Math.random/setTimeout in `frontend/src/` returns nothing
- [x] Error states — 503/unavailable states render via `AlertBanner`/panel-level empty states, verified live with Python killed, **now confirmed in a real browser (final sprint, §15.12): clean "SERVICE UNAVAILABLE" banner, honest per-panel empty states, zero console errors during the outage, auto-recovery re-rendered correctly**
- [x] Loading states — initial "Establishing link…" / "Waiting for first telemetry frame…" states present, code-verified; **real-browser QA performed final sprint (§15.12) confirmed no perpetual/stuck loading state under normal operation**
- [x] Clear operator experience — alert banner surfaces a plain-language headline + RUL note derived from live health/RUL state; mission section surfaces the backend's own `operatorRecommendation`/`operatorRationale`/`interpretation` text directly. **One bug found and fixed final sprint (§15.12): the banner headline could say "Engine nominal" while the badge next to it read CAUTION — fixed in `AlertBanner.tsx`.**

### Demo
- [x] Healthy engine — backend data is demo-ready and has a UI to show it (verified live, NORMAL condition, health now shows a clean 100.00 with the corrected baseline)
- [x] Fault injection — live and frontend-controllable for the primary dashboard via `SimulatorControlPanel` → `POST /api/simulator/fault` (session 4). Expect a real ~120s wait after activation before anything visibly changes — set a demo timer, don't rush it.
- [x] Early detection — FINDING-4 (the physics-model divergence) is RESOLVED (§15.6): the classifier correctly identifies all 3 physical faults with 97-98% confidence. Session 8 (§15.7) investigated the remaining anomaly-gate behavior and found it splits cleanly by fault type, not randomly: **Lubrication Degradation and Misfire reliably cross the gate within ~5-45s of onset (`predictedFault` correctly flips); Injector Degradation and Sensor Drift's correct classifier confidence stays hidden behind a gate that does not cross for them**, evidenced across several-minute live windows, not a couple of ticks.
- [x] Diagnosis — demo-ready and rendered for NORMAL; **all three physical fault classifiers hold high, stable confidence live (Injector 97.6-97.8%, Lubrication 98.7%, Misfire 96.8-97.5%)**. `predictedFault` itself reliably shows the correct label for Lubrication and Misfire once the gate crosses (within about a minute of onset); for Injector and Sensor Drift, `predictedFault` will most likely stay `NORMAL` even though `faultProbabilities` is correct underneath — this is now a fully investigated, evidence-backed and expected split (§15.7), not random flakiness. **Prefer Lubrication Degradation or Misfire for a demo that needs `predictedFault` to visibly change.**
- [x] RUL — backend data is demo-ready and rendered, including the honest withheld/null case; reconfirmed honest under all 4 live fault conditions (never fabricated)
- [x] Mission decision — demo-ready and rendered (Mission Simulation + What-If panels), live-verified across NORMAL + all 4 fault types (§15.1) — still the most reliably correct part of the demo story

**Bottom line: the core FINDING-4 divergence that made live fault diagnosis unreliable is resolved, and the fix was proven with the real trained classifier's own output, not assumed.** All three physical faults now show high, consistent classifier confidence live. Session 8 investigated the remaining anomaly-gate intermittency end-to-end (§15.7), determined the threshold itself is not the problem, root-caused a separate live/offline gap to three mechanisms (§15.8, FINDING-5), **fixed and verified the largest of the three** (history-buffer cadence, §15.9), and **quantified the remaining two as negligible, closed as document-only** (§15.10). The overnight sprint that followed found and fixed two additional, previously-undocumented bugs: **BUG-3** (WS timestamp serialization) and **BUG-4** (the sensor-isolation gate falsely labeling real physical faults as `SENSOR_FAULT` whenever the anomaly gate hadn't crossed — Injector and Misfire specifically, both confirmed fixed live across many samples, §15.11). Neither fix touches FINDING-3 (sensor-drift multi-channel isolation), which remains open and was explicitly re-confirmed unaffected. **For a live demo: all four fault scenarios now show an honest, non-misleading diagnosis** — Lubrication Degradation and Misfire reliably show the correct `predictedFault` within about a minute of onset (poll-rate-independent); Injector Degradation and Sensor Drift correctly show high classifier confidence in `faultProbabilities` with `predictedFault` reading `NORMAL` (conservative, no longer a false `SENSOR_FAULT` claim for Injector). A full live NORMAL→fault→NORMAL sequence for all 4 faults was re-run this sprint with clean reset integrity at every checkpoint (§15.11). Live Python-unavailable recovery re-verified fresh, confirming the rewritten `DiagnosticService`'s 503 propagation is unaffected. The remaining infrastructure gap is real-browser visual QA — no browser automation tool is available in this environment; frontend resilience was audited at the source level only.

## 22. Final Demo Requirements

Not yet defined in a dedicated demo script — deferred until a frontend exists to demo against. When planning it, use the verified live payloads in §6 as ground truth for what the UI needs to render.

## 23. Important Architectural Decisions

- Health/degradation/RUL contract mismatch between Java's `DiagnosticSnapshot.physicsPrediction` field and Python's various `prediction`-named models was resolved with **two different, endpoint-appropriate techniques**: `HealthServiceClient` builds a purpose-specific `HealthDiagnosticInput` record with a `prediction` field (renaming at the Java boundary) for the strict, non-aliased `/health/evaluate` Pydantic model; `DegradationServiceClient` sends the raw `DiagnosticSnapshot` as-is, and `/degradation/evaluate`'s `DiagnosticHealthInput` Pydantic model accepts it via `Field(alias="physicsPrediction")` + `populate_by_name=True`. Both are correct, verified working, and should be treated as intentional — **do not "fix" this into one single naming convention without re-verifying both endpoints**, since each was deliberately solved to fit that endpoint's actual contract.
- Sensor-vs-physical double counting is avoided by explicitly excluding an isolated faulty sensor's channel from the physical subsystem score computation (`health_calculator.py`), rather than by adjusting weights after the fact.
- RUL/degradation explicitly refuse to fabricate estimates below `MIN_RUL_HISTORY_SAMPLES` / when no physical fault is corroborated — this is a hard architectural rule enforced in code (`degradation_estimator.py`), not just a convention.
- **Frontend polls the aggregate `/api/diagnostics/current` every 2s as its single source of truth** for everything except live telemetry (which comes from the WebSocket). This was a deliberate choice over polling `/api/health/current`, `/api/degradation/current`, `/api/rul/current` separately: those three all recompute from `DiagnosticService`'s in-memory history independently, so separate polls could show a health/degradation/RUL combination that never coexisted at the same instant. One snapshot per tick keeps the whole dashboard internally consistent. **Do not split the dashboard onto per-endpoint polling without re-solving this desync risk.**
- Frontend uses hand-written CSS, not Tailwind, despite `CorsConfig.java`'s comment mentioning Tailwind as the originally-anticipated stack. This is a pragmatic session-2 choice (fewer build-config moving parts, no PostCSS setup risk) — it does not affect the CORS contract, which only cares about the origin (`localhost:5173`), not the styling approach. Revisit only if the team has a strong preference; nothing structurally depends on plain CSS.

## 24. Things NOT To Build Yet

Per the handover brief §49 and confirmed by this audit: no Transformer/LSTM/PINN, no CFD, no extra microservices, no database, no cloud infra, no lowering the anomaly threshold blindly, no claiming synthetic accuracy as real-world validation. Additionally, based on this audit: **do not rebuild the Java↔Python contract "fix"** described in the original brief — it's not needed, it's already correctly handled (see §23).

## 25. Handover Notes

- The single biggest surprise of this audit: the backend/physics/ML pipeline is in noticeably better shape than the handover brief implied (the specific 422 bug it warned about is fixed; the misfire zero-severity bug it warned about is fixed and regression-tested; mission replay isolation it asked to verify is implemented and tested). Trust degraded, but not distrust — always verify, exactly as instructed, and this time verification mostly vindicated the code.
- The one thing the brief got backwards was `httpx2` — in 2026, on this ecosystem, `httpx2` is correct and `httpx` would have broken the test client. Don't revert this without checking the installed `starlette` version's actual import behavior first.
- The frontend gap was real (session 1) and has since been closed (session 2) — a working Vite/React/TS console now exists at `frontend/` and was live-verified against the real backend. Update any external SIH materials that still say "no UI."
- Anomaly recall (~6.5-7%) is real and reproducible on a fresh training run with fresh data — worth a dedicated, careful investigation session per §43's one-change-at-a-time discipline, not a quick threshold tweak.
- Two Python interpreters exist on this dev machine; only the native Windows one (`AppData\Local\Programs\Python\Python312\python.exe`) successfully installs this project's dependencies. Use that one for any future venv setup here.
- Two Node/npm environments were not an issue — `node`/`npm` on PATH installed and built the frontend cleanly on the first try, no interpreter-selection gotcha like the Python one.
- No browser-automation tool was available this session, so the frontend was verified at the data/contract layer (build success, live API cross-checks, a real WebSocket client, 503 states) but never actually rendered and eyeballed. That is the single biggest remaining unknown about the frontend — flag it before treating the UI as demo-ready for a real audience.
- The what-if/mission-simulate calls now deliberately pass the *live* current degradation/RUL as the simulation's starting point (`MissionSection` reads `snapshot.degradation`/`snapshot.rul.rulHours` from the polling hook), rather than always simulating from a fresh-healthy baseline. This makes the "mission decision" story reflect the engine's actual current condition — worth knowing if mission numbers look different from a cold-start test.

---

## Status Table

| Component | Status | Evidence | Remaining Work |
|---|---|---|---|
| Physics simulator | IMPLEMENTED + VERIFIED | Live `/physics/predict` calls, plausible outputs across varied inputs; now the sole source of live "healthy" telemetry too (session 7, §15.6) — Java/Python equivalence confirmed to 6 decimal places | None blocking |
| Dataset generation | IMPLEMENTED + VERIFIED | Fresh run: 7500 rows/25 missions, reproducible with seed 42 | None blocking |
| Residual generation | IMPLEMENTED + VERIFIED | Live `/api/twin/current`, actual−expected confirmed correct sign | None blocking |
| Anomaly detection | IMPLEMENTED + VERIFIED (gate investigated, root-caused, and primary fix applied session 8) | Offline AUC~0.59, uniform-weak across all 4 fault types (§15.7) — threshold unchanged, defensible. FINDING-5 root-caused (§15.8) to 3 mechanisms; the largest (poll-driven history sampling) fixed and verified (§15.9) — history is now scheduler-driven at 1Hz, poll-rate-independent (causally confirmed live). Lubrication's slow/fast-cadence scores now converge | Address the 2 remaining secondary contributors: zero live per-tick telemetry noise, permanent `missionPhase="IDLE"` (P2, §17, §15.8) |
| Fault classification | IMPLEMENTED + VERIFIED — **live classification confirmed correct** | Fresh training: macro F1 0.64; session 7 (post-FINDING-4-fix), real classifier output on real live vectors: Injector 97.79%, Lubrication 98.0-98.1%, Misfire 97.3-97.9% for the correct class (§15.6) — a complete reversal from session 5/6's mislabeling | None blocking for classification itself; surfacing depends on the anomaly gate above |
| Sensor fault isolation | IMPLEMENTED + VERIFIED for single-channel faults; live multi-channel gap (FINDING-3) confirmed independent of all prior fixes including BUG-4 | Live: correctly isolated in the primary chain for single-channel deviations; mission chain confirms physical health/risk untouched by sensor drift (§15.1); re-tested post-FINDING-4-fix (session 7) and post-BUG-4-fix (overnight sprint, §15.11) — still no isolation for Sensor Drift specifically, confirming FINDING-3 is genuinely independent of every fix applied so far. **BUG-4 fixed overnight sprint**: a separate false-positive misattribution (Injector/Misfire incorrectly labeled SENSOR_FAULT) is resolved (§8 BUG-4, §15.11) | Multi-channel isolation heuristic for FINDING-3 (P2, §17) — untouched, out of scope for a safe overnight fix |
| Health estimation | IMPLEMENTED + VERIFIED | Live `/api/health/current`, subsystem + sensor breakdown correct | None blocking |
| Degradation estimation | IMPLEMENTED + VERIFIED | Live `/api/degradation/current`, correct low-confidence handling | Live mission-boundary isolation (P2) |
| RUL | IMPLEMENTED + VERIFIED | Live `/api/rul/current`, correctly null/STABLE, no fabrication | None blocking |
| Mission simulation | IMPLEMENTED + VERIFIED | Live `/api/mission/simulate`, real per-phase health propagation; all 4 fault types live-verified session 3 (§15.1) | None blocking |
| Mission what-if | IMPLEMENTED + VERIFIED | Live `/api/mission/what-if`, real baseline-vs-scenario deltas | None blocking |
| Mission replay | IMPLEMENTED + VERIFIED (offline only) | `test_replay_rul.py` 3/3, mission isolation confirmed | Live-path isolation (P2) |
| Live fault injection | IMPLEMENTED + VERIFIED | `POST /api/simulator/fault`, all 4 faults live-verified end to end for telemetry/physics/residuals (§15.3); NORMAL confirmed byte-for-byte unchanged | Diagnosis-stage gaps for 3/4 faults, see Anomaly/Classification/Isolation rows above |
| Java backend | IMPLEMENTED + VERIFIED | `mvnw test` 38/38, live endpoint sweep | Env-specific config (P2) |
| Python backend | IMPLEMENTED + VERIFIED | `pytest` 64/64, live endpoint sweep | None blocking |
| Frontend | IMPLEMENTED + VERIFIED (data layer + real browser) | `npm run build` PASS, live API/CORS/WS/503 cross-checks (§11, §19); mission fault selector (§15.1) and live simulator fault control panel (§15.3) both added and live-verified; **real-browser QA performed final sprint (§15.12) — all panels, all 4 faults, mission/what-if, and Python-outage recovery visually confirmed; 1 wording bug found and fixed** | None blocking. `backend/target/` untracking still pending approval (P2) |
| API integration | IMPLEMENTED + VERIFIED, 1 bug found+fixed | Live cross-service testing both up and physics-down | BUG-2 cleanup (P2) |
| WebSocket | IMPLEMENTED + VERIFIED (live), BUG-3 FIXED | Real Node `WebSocket` client, 4 frames at 1Hz over `ws://localhost:8080/ws/telemetry`, re-verified post-fix: `timestamp` now serializes as ISO-8601 (`typeof string`), matching REST exactly — was a raw epoch float (§8 BUG-3, §15.11) | Add an automated WS smoke test (still manual-only) |
| SHAP | IMPLEMENTED + VERIFIED (rarely triggers) | Code path confirmed, gated on anomaly=true; live session 4 confirms it rarely triggers because anomaly=true rarely occurs live | Depends on the anomaly-history fix (P1, §17) |
| Maintenance advisory | NOT REQUIRED YET | Not part of current scope | — |
| Mission risk | IMPLEMENTED + VERIFIED | Live `/api/mission/simulate` risk/reliability scores, real math | None blocking |
| Testing | IMPLEMENTED + VERIFIED | 66 Python + 48 Java, all passing, integration-level not just unit | Frontend automated tests (still none) |
| Docker/deployment | MISSING | No Dockerfile/compose file anywhere | Not required yet (P3) |
| SIH demo flow | IMPLEMENTED, with a known honest caveat | Full chain demoable live for all 4 faults (§15.3); FINDING-4 resolved session 7 — all 3 physical faults show 97-98% correct classifier confidence live (§15.6); anomaly gate investigated, root-caused, and primary-fixed session 8 (§15.7-§15.9) — Lubrication/Misfire detection is now poll-rate-independent and reliable; Injector/Sensor-Drift's gate still doesn't cross (consistent with offline evidence, not a bug); no threshold change made; no real-browser QA | Address 2 remaining secondary FINDING-5 contributors (P2, §15.8); browser QA |
