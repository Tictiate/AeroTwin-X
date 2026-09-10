# AeroTwin-X

**A physics-constrained digital twin for MALE UAV piston-engine health monitoring, fault diagnosis, and mission-reliability decision support.**

---

## 🚀 Live Demo

**AeroTwin-X Public Demo:** [https://aerotwin-x-rutvij2109s-projects.vercel.app](https://aerotwin-x-rutvij2109s-projects.vercel.app)

This is a **real deployment of the actual AeroTwin-X dashboard** — the same React/TypeScript code that runs locally, built and hosted on Vercel — not a screenshot or a mockup. It is honestly labeled as a **frontend demonstration**, not a fully live end-to-end demo: the Java/Spring Boot and Python/FastAPI services that drive telemetry, physics, and AI diagnosis run locally (see [Quick Start](#quick-start)) and are not currently hosted on a public backend. When opened without a local backend running, the dashboard correctly shows honest "connecting" / "unavailable" states on every panel — it never fabricates telemetry, health, or diagnosis data. This is the same graceful-degradation behavior the local system uses whenever a downstream service is unreachable, verified live rather than assumed.

**To see it fully live** (real telemetry, real anomaly detection, real fault injection), run all three services locally per [Quick Start](#quick-start) and open `http://localhost:5173` instead.

---

## Overview

Small unmanned aircraft engines rarely carry the instrumentation, telemetry history, or maintenance infrastructure that crewed aviation relies on, yet an undetected fuel, lubrication, or combustion fault can still end a mission. AeroTwin-X is a Smart India Hackathon prototype that explores how far a **reduced-order physics model + residual analysis + machine learning** pipeline can go toward giving a ground operator an honest, real-time answer to three questions: *is the engine healthy, what is wrong if it isn't, and can the current mission still be completed safely?*

The system runs a live, physics-driven engine simulator, continuously compares **actual telemetry against a physics-predicted expected state**, and feeds the resulting residuals through an anomaly detector and a fault classifier trained on synthetic, physics-generated fault data. Detected physical faults are distinguished from sensor-only faults, rolled up into a health index, extrapolated into a degradation/RUL estimate when there is enough history to justify one, and finally used to answer "what-if" questions about whether a planned mission profile is still safe to fly.

AeroTwin-X is a **working, end-to-end SIH MVP**, not a production flight system. Every claim in this document is backed by the code, tests, and live validation in this repository — see [Known Limitations](#known-limitations) for what it honestly does *not* yet do.

---

## Key Capabilities

All of the following are implemented and live-verified in this repository (not aspirational):

- **Real-time engine telemetry simulation** at 1 Hz, streamed over both REST and WebSocket
- **Reduced-order physics digital twin** — expected engine state computed independently from live telemetry
- **Actual-vs-expected residual generation** (signed and normalized, per channel)
- **Unsupervised anomaly detection** (Isolation Forest) over rolling-window residual features
- **Multiclass fault classification** (XGBoost) with per-fault probabilities
- **SHAP-based explainability** for classifier decisions, gated on an active anomaly
- **Sensor-fault vs. physical-fault isolation** — distinguishes "a sensor is lying" from "the engine is actually degrading"
- **Health index** with a six-subsystem breakdown (thermal, lubrication, combustion, mechanical, electrical, sensors)
- **Degradation & Remaining Useful Life (RUL) estimation**, including honest refusal to estimate when history is insufficient
- **Mission reliability simulation** and **What-If trade studies** (e.g. "what if cruise is 50% longer?")
- **Live fault injection** via a REST control endpoint, with deterministic reset back to a healthy baseline
- **Live operator dashboard** (React/TypeScript) consuming all of the above in real time
- **Graceful degraded-mode UI** — the dashboard stays honest and doesn't crash or fabricate data when a downstream service is unavailable

---

## System Architecture

```
 Live Engine Simulator (Java)
          │  telemetry @ 1 Hz
          ▼
 Physics Digital Twin  ───────►  POST /physics/predict (Python)
          │                              │
          │                     expected engine state
          ▼                              │
   Actual − Expected  ◄──────────────────┘
      Residuals
          │
          ▼
  Feature Extraction (rolling mean/std/slope, 5-sample window)
          │
          ▼
  Anomaly Detection (Isolation Forest)
          │
          ▼
  Fault Classification (XGBoost) ──► SHAP Explanation (on anomaly)
          │
          ▼
  Sensor-Fault vs. Physical-Fault Isolation
          │
          ▼
  Health Index (6 subsystems)
          │
          ▼
  Degradation Estimate ──► RUL (or honestly withheld)
          │
          ▼
  Mission Reliability / What-If Simulation
          │
          ▼
  Operator Dashboard (React) — live telemetry, diagnosis,
  health, degradation/RUL, mission risk, fault control
```

**Service split:** the **Java/Spring Boot backend** owns live simulation, orchestration, REST/WebSocket delivery, and the diagnostic-history buffer; the **Python/FastAPI service** owns *all* domain algorithms — physics prediction, feature engineering, the anomaly detector, the fault classifier, health/degradation/RUL math, and mission simulation. Java never re-implements physics or ML logic; it calls Python for every one of those and degrades gracefully (clean `503`s, not fabricated data) when Python is unreachable.

---

## Technology Stack

### Backend — Java

| Component | Version / Detail |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.3.0 (`spring-boot-starter-web`, `spring-boot-starter-websocket`) |
| Build | Maven (wrapper included, `mvnw` / `mvnw.cmd`) |
| Testing | JUnit 5 + Spring's `@WebMvcTest`/Mockito, 53 tests |

### Physics / ML — Python

| Component | Version / Detail |
|---|---|
| Language | Python 3.12 |
| Framework | FastAPI + Uvicorn |
| Validation | Pydantic |
| Numerics | NumPy, pandas |
| Anomaly detection | scikit-learn `IsolationForest` |
| Fault classification | XGBoost multiclass `XGBClassifier` |
| Explainability | SHAP `TreeExplainer` |
| Testing | pytest, 74 tests |

### Frontend

| Component | Version / Detail |
|---|---|
| Framework | React 18.3 + TypeScript 5.6 |
| Build tool | Vite 5.4 |
| Styling | Hand-written CSS (no CSS framework) |
| Charts | Hand-rolled `Sparkline`/`Bar` components (no third-party charting library) |
| State | React hooks (`useDiagnostics`, `useTelemetryStream`) polling REST + a live WebSocket — no external state-management library |

### Communication

- **REST** (JSON over HTTP) for all diagnostic reads and control actions
- **WebSocket** (`/ws/telemetry`) for live 1 Hz telemetry push to the dashboard
- CORS configured explicitly for the frontend's dev origin

---

## Digital Twin / Physics Approach

AeroTwin-X's "digital twin" is a **reduced-order physics model**, not a CFD or finite-element simulation. Given the current operating point (altitude, ambient temperature, throttle, load, RPM), the Python physics service computes an *expected* value for each telemetry channel — EGT, CHT, oil temperature, oil pressure, fuel flow, vibration — using a causal chain of first-order relationships (air density → airflow → fuel flow/heat release, first-order thermal filters for CHT/oil temperature, etc.).

The Java simulator separately produces the *actual* telemetry. **The residual — actual minus expected — is the core signal the rest of the pipeline is built on.** A healthy engine's residuals stay near zero; a real physical fault (a degrading injector, failing lubrication, a misfire, a drifting sensor) pushes one or more residuals away from zero in a way that's characteristic of that fault. Feeding *residuals*, not raw telemetry, into the ML layer is what lets the same model generalize across different operating points instead of needing to memorize "what normal looks like" at every altitude/throttle/load combination.

This is explicitly an SIH-prototype-appropriate approximation: it captures the right causal shape of engine behavior without claiming to be a validated representation of any specific real aero piston engine.

---

## AI / Fault Diagnosis

The diagnostic pipeline has two distinct, independently-evaluated models sitting on top of the residuals — and understanding the difference between them is important for reading the dashboard correctly:

1. **Anomaly detection (Isolation Forest)** — trained only on healthy telemetry, it produces a single **anomaly score** per tick. A fixed threshold (the 95th percentile of healthy training scores, currently `0.6124`) gates whether the tick is flagged `anomaly = true`. **This threshold is deliberately conservative and has not been artificially lowered to make the demo look better.** On this project's own held-out synthetic test set, the anomaly gate's recall is low (roughly 6–7%) — by design, not by bug — because separating "faulty" from "healthy" on a single tick's residual statistics alone is a genuinely hard problem, and a gate that fires too eagerly would be a worse operator experience than one that stays quiet until it's confident.
2. **Fault classification (XGBoost, multiclass)** — runs independently, producing a **probability for every fault type on every tick**, gated by nothing. On the same held-out test set it reaches ~63% accuracy / ~0.64 macro F1 across five classes (NORMAL + 4 faults) — well above the 20% random baseline, and considerably stronger for the faults with the clearest residual signatures (Injector Degradation and Misfire both exceed 0.70 F1).

**The important, honest distinction the dashboard surfaces explicitly:** the anomaly gate can stay closed (`predictedFault = NORMAL`) on a tick where the classifier is already 97–98% confident in a specific physical fault underneath. The UI's Fault Probability panel shows the classifier's raw probabilities regardless of the gate, so an operator isn't blind to a real fault just because the conservative gate hasn't tripped yet — but the top-line verdict only flips once both signals agree. SHAP explanations are computed and shown only when the anomaly gate *is* open, since an explanation for "why is this anomalous" is meaningless when nothing has been flagged as anomalous.

---

## Health, Degradation and RUL

- **Health Index** — a 0–100 score built from six weighted subsystem scores (Thermal 0.20, Lubrication 0.20, Combustion 0.20, Mechanical 0.15, Sensors 0.15, Electrical 0.10), each derived from an exponential penalty on normalized residuals with a 5-sample persistence window and exponential smoothing (α = 0.30). Bands: `90–100 HEALTHY`, `75–89 CAUTION`, `50–74 DEGRADED`, `0–49 CRITICAL`.
- **Degradation** — estimated per component as `100 − subsystem health`, tracked with a rolling linear trend and a `HEALTHY` / `STABLE` / `DEGRADING` label.
- **RUL** — `RUL hours = (current health − EOL threshold) / degradation rate per hour`, with an EOL threshold of `50`, plus propagated lower/upper bounds and a confidence score.
- **RUL is honestly withheld** (`status = INSUFFICIENT_HISTORY` or `STABLE`, `rulHours = null`) whenever there isn't enough sequential degradation history to support an extrapolation, or when no corroborated physical fault is active — the system does not fabricate a countdown timer to look more impressive. This is enforced in code, not just a UI convention.

All of these are prototype engineering assumptions calibrated against this project's own synthetic fault data — not certified maintenance limits.

---

## Mission Reliability

`POST /api/mission/what-if` runs the same mission-simulation engine twice — once as a **baseline** and once under a **scenario** (a modified cruise duration, load, throttle, or an injected fault) — starting from the engine's **actual current health/degradation state**, not a fresh-healthy assumption. The response includes:

- A **risk score** and **reliability %** for both baseline and scenario
- **Projected end-of-mission health** and **minimum health reached** during the mission
- The **critical phase** (which mission segment drives the worst risk)
- A **Go / Caution / High-Risk recommendation**
- A **narrative interpretation** explaining the delta in plain language

This is genuinely computed from the mission-phase-by-phase health propagation model, not a lookup table or a random number — verified live by running it repeatedly against the same and different engine states and confirming the deltas track the actual degradation being simulated.

---

## Fault Injection / Demo Scenarios

| Fault Mode | Purpose | Expected Demonstration |
|---|---|---|
| `NORMAL` | Healthy baseline | Residuals ≈ 0, health 100, `predictedFault = NORMAL` |
| `INJECTOR_DEGRADATION` | Fuel/injector degradation | Real residual deviation; classifier ~98% confident; anomaly gate stays conservative (correct, not a bug) |
| `LUBRICATION_DEGRADATION` | Lubrication deterioration | Strongest demo scenario — anomaly gate reliably crosses at onset, classifier ~98% confident, health visibly drops |
| `MISFIRE` | Combustion irregularity | Residual/vibration signature; classifier ~97% confident; anomaly gate crosses probabilistically (~1 in 3 ticks) because the underlying fault model is itself stochastic — this is intentional, not flaky |
| `SENSOR_DRIFT` | Sensor degradation | Residuals grow unboundedly over time; classifier correctly identifies Sensor Drift internally at high confidence, but **multi-channel isolation does not yet flag it as `SENSOR_FAULT`** (see [Known Limitations](#known-limitations)) |

Fault activation is via `POST /api/simulator/fault` with an optional fixed severity; without one, the fault follows its natural ~120-second onset-and-ramp schedule (matching the offline training data's own timing, so live and offline behavior stay comparable). `faultType: NORMAL` (or a GET on the same endpoint) resets to a clean healthy baseline and clears the diagnostic history buffer — confirmed to leave zero residual carry-over between scenarios.

---

## Live Demo Flow

The sequence below is the one actually validated end-to-end against the running system, including real-browser observation of the dashboard at every step:

1. Start in `NORMAL` — point out residuals at ~0 and health at 100
2. Explain the Physics Twin panel: actual vs. expected, live
3. Activate `LUBRICATION_DEGRADATION` (severity `0.9`) — the strongest, most reliable scenario
4. Wait through the ~120s onset (don't rush this — it's real, not simulated instantly)
5. Show the anomaly gate crossing, classifier confidence, and the health index dropping
6. Show the Degradation panel's Lubrication-dominant mechanism breakdown
7. Run **Mission What-If** from this degraded state and show the risk/reliability delta
8. Reset to `NORMAL` and show the clean recovery (residuals back to 0, health back to 100)
9. *(Optional)* Activate `INJECTOR_DEGRADATION` to show the classifier-confident/gate-conservative split explicitly — a good moment to explain *why* the gate doesn't always cross, rather than treating it as a bug
10. *(Optional, with a caveat)* Activate `MISFIRE` to show the probabilistic gate crossing — label it explicitly as "this fault model is intentionally stochastic" rather than letting it look inconsistent

`SENSOR_DRIFT` is a legitimate scenario to show (it demonstrates the system fails gracefully — no crash, no false certainty) but should be framed as "here's an open limitation we're honest about," not as a clean success case.

---

## Project Status / Validation

AeroTwin-X has been validated through a real end-to-end sweep with all three services running simultaneously and the dashboard open in an actual browser — not just unit tests in isolation.

| Check | Result |
|---|---|
| Java test suite | **53 / 53 passing** |
| Python test suite | **74 / 74 passing** |
| Frontend production build | **Passing**, 0 TypeScript errors |
| Real-browser QA | Completed — full dashboard, all panels, zero console errors across a full fault sweep |
| Live WebSocket | Verified — continuous 1 Hz frames, correct ISO-8601 timestamps |
| Live fault injection | Verified for all 4 fault types + reset, with real onset timing |
| Mission What-If | Verified live, including repeated execution with no crash |
| Backend outage recovery | Verified live — Python killed mid-session, Java returns clean `503`s, dashboard degrades gracefully, auto-recovers on restart with no manual intervention |

These are **prototype validation results on this project's own synthetic dataset and live simulator**, not a certification, not a benchmark against real flight data, and not a guarantee of accuracy on a real engine.

---

## Known Limitations

AeroTwin-X is an honest prototype. These are the limitations we know about and haven't hidden:

**Sensor-drift multi-channel isolation (open).** The sensor-vs-physical isolation heuristic was designed around a single anomalous sensor. `SENSOR_DRIFT` perturbs four channels simultaneously, so the isolation panel currently does not flag it as `SENSOR_FAULT` even though the fault classifier internally identifies Sensor Drift with high confidence. The system behaves gracefully (no crash, no false certainty) — it just doesn't yet isolate this specific fault correctly.

**Conservative anomaly gate for Injector Degradation and Sensor Drift.** Both can sit below the anomaly threshold indefinitely even while the classifier reports 97%+ confidence in the correct fault. This is a deliberate, evidence-based design choice (the threshold was not lowered to manufacture more "detections"), but it does mean the top-line `predictedFault` field alone understates what the system actually knows for these two faults — the Fault Probability panel is where that information lives.

**RUL can be legitimately unavailable.** Early in a run, after every fault reset, or whenever no corroborated physical fault is active, RUL is withheld rather than estimated. This is intentional and enforced in code — not a bug to be "fixed" by relaxing the guard.

**Synthetic, physics-constrained telemetry.** All telemetry, faults, and training data come from this project's own physics simulator and dataset generator, not a real aircraft or real fleet history. The physics model is reduced-order and explicitly not a substitute for CFD or a validated model of a specific real engine.

**History-cadence dependency, partially resolved.** An earlier issue where the ML feature pipeline's rolling-window history was populated at REST-poll cadence (rather than a fixed clock) has been fixed — diagnostic history is now populated by the same 1 Hz scheduler that drives the simulator, independent of how often a client polls. Two smaller, secondary contributors to a live/offline scoring gap (near-zero live sensor noise, and the live simulator's mission phase never varying from `IDLE`) were investigated, quantified as negligible, and documented rather than "fixed" by changing training data to match — see `AEROTWIN_PROJECT_MASTER.md` for the full investigation.

None of the above is presented as broken — each is a specific, understood, and honestly-labeled boundary of an SIH prototype.

---

## Quick Start

**Tested on:** Windows (PowerShell), three terminals — Java, Python, frontend.

### Prerequisites

- Java 21 (Maven wrapper included, no separate Maven install needed)
- Python 3.12
- Node.js (for `npm`) — the frontend was built and tested with a recent Node LTS

### 1. Start the Python physics/ML service

A pre-provisioned virtual environment already exists at `physics-service/.venv/` with FastAPI, scikit-learn, XGBoost, SHAP, etc. already installed.

```powershell
cd physics-service
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

```sh
# macOS/Linux
cd physics-service
source .venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Trained model artifacts live under `data/models/` (gitignored). If they're missing on a fresh clone, `/ml/analyze` returns `503 ml-unavailable` until you generate them once:

```sh
python scripts/generate_dataset.py --scenario ALL --duration-seconds 300 --runs-per-scenario 5 --seed 42 --output-dir data/generated
python -m app.ml.training --dataset data/generated --artifacts data/models --seed 42
```

### 2. Start the Java backend

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

```sh
# macOS/Linux
cd backend
./mvnw spring-boot:run
```

### 3. Start the frontend

```sh
cd frontend
npm install   # first time only
npm run dev
```

### 4. Open the dashboard

**http://localhost:5173**

### 5. Run the demo

```sh
curl -X POST http://localhost:8080/api/simulator/fault \
  -H "Content-Type: application/json" \
  -d '{"faultType":"LUBRICATION_DEGRADATION","severity":0.9}'
```

Wait ~120 seconds for the real onset ramp before checking the diagnosis panel, then reset with:

```sh
curl -X POST http://localhost:8080/api/simulator/fault \
  -H "Content-Type: application/json" -d '{"faultType":"NORMAL"}'
```

See [Live Demo Flow](#live-demo-flow) for the full recommended sequence.

---

## Repository Structure

```
backend/                  Java/Spring Boot service — simulation, orchestration, REST + WebSocket
  src/main/java/com/aerotwin/
    controller/            REST controllers + the WebSocket handler
    service/                Clients to the Python service, diagnostic-history buffer
    simulator/               Live engine telemetry simulator
    model/                    DTOs
  src/test/java/            53 JUnit tests

physics-service/          Python/FastAPI service — physics, ML, health/degradation/RUL, mission
  api/routes/                REST route definitions
  app/
    ml/                       Feature engineering, anomaly detector, classifier, SHAP, training
    health/                   Health index + sensor isolation
    degradation/              Degradation + RUL estimation
    mission/                  Mission simulation + What-If
    simulation/               Fault models used by both the offline generator and live injection
  scripts/                   Dataset generation, training, offline replay
  tests/                     74 pytest tests
  data/                      generated/ (datasets) and models/ (trained artifacts) — both gitignored

frontend/                 React/TypeScript operator dashboard
  src/components/            One component per dashboard panel
  src/hooks/                 Polling (useDiagnostics) and WebSocket (useTelemetryStream) hooks
  src/api/                   Typed REST/WS client

README.md                 This file
AEROTWIN_PROJECT_MASTER.md  Full engineering log: every session's investigation, decisions,
                           evidence, and open findings — the authoritative internal record
```

---

## API / Service Overview

### Java (`http://localhost:8080`)

| Endpoint | Purpose |
|---|---|
| `GET /api/telemetry/current` | Raw live telemetry |
| `GET /api/twin/current` | Actual + expected + residuals |
| `GET /api/diagnostics/current` | Full diagnostic snapshot (telemetry, twin, ML analysis, health, degradation, RUL) |
| `GET /api/health/current` | Health index + subsystem breakdown |
| `GET /api/degradation/current` | Degradation state |
| `GET /api/rul/current` | RUL estimate (or honest unavailability) |
| `GET/POST /api/mission/*` | Mission profile, simulate, what-if |
| `GET/POST /api/simulator/fault` | Read/set the live fault-injection state |
| `WS /ws/telemetry` | Live 1 Hz telemetry stream |

### Python (`http://localhost:8000`)

| Endpoint | Purpose |
|---|---|
| `GET /health` | Service liveness |
| `POST /physics/predict` | Expected engine state for a given operating point |
| `POST /ml/analyze` | Anomaly score, fault probabilities, SHAP explanation |
| `POST /health/evaluate` | Health index + sensor isolation |
| `POST /degradation/evaluate` | Degradation + RUL |
| `POST /mission/simulate`, `/mission/what-if` | Mission trajectory + trade-study simulation |
| `POST /simulation/inject-fault` | Fault-model math backing the live simulator's fault injection |

All Java REST reads are **read-only** — they never mutate simulator or diagnostic state; only `POST /api/simulator/fault` changes system state, and it does so explicitly and resettably.

---

## Development / Validation

```sh
# Java — 53 tests
cd backend && ./mvnw test        # or .\mvnw.cmd test on Windows

# Python — 74 tests
cd physics-service && .venv/Scripts/python.exe -m pytest -q

# Frontend — production build (tsc + vite build)
cd frontend && npm run build
```

Current passing baseline: **53/53 Java, 74/74 Python, frontend build clean.**

---

## Engineering Notes

- **Python is the single source of truth for every domain algorithm** — physics, features, anomaly detection, classification, health, degradation, RUL, and mission math all live in Python. Java owns orchestration, live simulation, and delivery, and never duplicates domain logic.
- **Diagnostic history is populated by a 1 Hz scheduler, not by REST-poll timing** — the ML feature pipeline's rolling-window assumptions require evenly-spaced samples, so history growth is decoupled from how often any client happens to poll.
- **REST reads never mutate state.** Only the fault-injection endpoint changes anything, and only when explicitly called.
- **The anomaly threshold has not been artificially lowered** to make detections look more frequent — it's the 95th percentile of the model's own healthy-training-data scores, left as computed.
- **RUL is never fabricated.** The system refuses to produce a number it can't justify from actual history, by design in the estimator itself, not just in the UI.
- **Fault injection is explicit, bounded, and resettable** — nothing in the live simulator drifts into a fault state on its own; every fault is operator-triggered and cleanly reversible.
- **The dashboard fails honestly.** When a downstream service is unavailable, the UI shows a clear "service unavailable" state with whatever last-known data is safe to show — it does not fabricate values or silently freeze without explanation.

---

## SIH Context

AeroTwin-X targets the core problem statement of condition-based maintenance for small UAV propulsion: most MALE-class UAV operators don't have the sensor density, telemetry history, or maintenance infrastructure of crewed aviation, yet an undiagnosed engine fault can still abort or lose a mission. AeroTwin-X demonstrates one practical architecture for closing that gap on a resource-constrained platform — a physics-based expected-state model that doesn't need a large real-world failure dataset to bootstrap, residual-driven anomaly/fault detection on top of it, and a health/degradation/RUL/mission-risk chain that turns a raw diagnosis into an operator-actionable "can this mission still be flown" answer.

This repository demonstrates the **architecture and reasoning approach**, validated end-to-end on a synthetic but physically-grounded dataset. It is not a claim of operational readiness, flight certification, or deployment on a real UAV fleet.
