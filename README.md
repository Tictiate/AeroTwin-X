# AeroTwin-X

Physics-Informed Adaptive Digital Twin for Predictive Health Monitoring
and Mission Reliability of MALE UAV Piston Engines.

## Phase 1 Architecture

The Phase 1 prototype contains two services:

* **Java/Spring Boot backend**: owns the telemetry contract, mission conditions,
  deterministic healthy-engine simulation, REST endpoint, and WebSocket stream.
* **Python/FastAPI physics service**: provides the foundation health endpoint for
  future physics and ML functionality.

The simulator uses a reduced-order causal chain: altitude and ambient temperature
produce air density, air density and RPM produce airflow, airflow and throttle
produce fuel flow and a fuel/air heat-release proxy, and first-order filters model
CHT and oil-temperature response. These are explicitly prototype assumptions and
are not validated representations of a specific real aero piston engine.

Telemetry uses SI/engineering units, `Instant`, a `MissionPhase` enum, and
normalized throttle/load values in the range `0.0` to `1.0`.

## Run Phase 1

Java backend:

```sh
cd backend
./mvnw spring-boot:run
```

Python physics service (in another terminal):

```sh
cd physics-service
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m uvicorn main:app --reload
```

## Phase 1 Endpoints

* `GET http://localhost:8080/api/telemetry/current`
* `ws://localhost:8080/ws/telemetry`
* `GET http://localhost:8000/health`
* `POST http://localhost:8000/physics/predict`
* `GET http://localhost:8080/api/twin/current`

The Java backend calls the physics service through `PHYSICS_SERVICE_URL` (default
`http://localhost:8000`). If that service is unavailable, `/api/twin/current`
returns HTTP `503` with `{"status":"physics-unavailable"}`; raw telemetry remains
available from `/api/telemetry/current`.

## Phase 2 Prediction Contract

Send the Phase 1 telemetry JSON to `POST /physics/predict`. The response contains
only calculated expected values:

```json
{
  "expectedRpm": 3900.0,
  "expectedEgt": 600.0,
  "expectedCht": 150.0,
  "expectedOilTemperature": 82.0,
  "expectedOilPressure": 395.0,
  "expectedFuelFlow": 12.0,
  "expectedVibration": 6.0,
  "expectedBatteryVoltage": 14.2
}
```

`/api/twin/current` groups actual telemetry, expected state, signed residuals
(`actual - expected`), and normalized residuals. Battery voltage is predicted for
display but is intentionally excluded from physics residuals.

## Phase 3 Dataset Generation

Phase 3 adds deterministic offline fault injection and labeled CSV generation.
It does not add machine learning or fault classification. The generator keeps a
healthy reference stream, applies a causal fault model to the observed telemetry,
then calculates residuals against the unchanged healthy prediction.

Generate the five demonstration scenarios and the combined dataset:

```sh
cd physics-service
source .venv/bin/activate
python scripts/generate_dataset.py \
  --scenario ALL \
  --duration-seconds 300 \
  --sample-rate-hz 1 \
  --seed 42 \
  --output-dir data/generated
```

The command writes `healthy_missions.csv`, `injector_degradation.csv`,
`lubrication_degradation.csv`, `misfire.csv`, `sensor_drift.csv`, and
`aerotwin_training_dataset.csv`. Generated CSV files are ignored by Git.

Analyze residual signatures:

```sh
python scripts/analyze_residuals.py data/generated/aerotwin_training_dataset.csv
```

The default schedule is healthy operation until 120 seconds, followed by a
120-second linear severity ramp to 1.0 and a high-severity hold. Use
`DatasetConfig.fixed_severity` from Python for fixed severity experiments.
The `--seed` selects a repeatable operating profile and controls deterministic
misfire events. Use the same scenario, configuration, and seed to reproduce a
dataset exactly.

## Phase 4 Analytics

Generate multiple independent runs before training so temporal samples never
cross train/validation/test boundaries:

On macOS, install the XGBoost OpenMP runtime once before training:

```sh
brew install libomp
```

```sh
python scripts/generate_dataset.py \
  --scenario ALL \
  --duration-seconds 300 \
  --runs-per-scenario 5 \
  --seed 42 \
  --output-dir data/generated
python -m app.ml.training \
  --dataset data/generated \
  --artifacts data/models \
  --seed 42
```

Training splits by `missionId`, with 60% of each class's missions for training,
20% for validation, and 20% for testing. Isolation Forest is trained only on
healthy training missions. Its anomaly threshold is the 95th percentile of
healthy validation scores. The classifier is an independent multiclass XGBoost
model; its outputs are model probabilities, not calibrated real-world fault
probabilities.

The inference endpoint is `POST http://localhost:8000/ml/analyze`. The Java
diagnostic endpoint is `GET http://localhost:8080/api/diagnostics/current`.
If the ML service or artifacts are unavailable, the endpoint returns `503` with
the available telemetry, physics prediction, and residuals instead of fake ML
results. Phase 4 does not implement RUL, SHAP, health index, or mission risk.

## Phase 5 Health and Sensor Isolation

Phase 5 adds interpretable health aggregation through:

* `GET http://localhost:8080/api/health/current`
* `GET http://localhost:8080/api/diagnostics/current`
* `POST http://localhost:8000/health/evaluate`

The health calculation uses six subsystem scores: thermal, lubrication,
combustion, mechanical, electrical, and sensors. Prototype engineering weights
are respectively `0.20`, `0.20`, `0.20`, `0.15`, `0.10`, and `0.15`. These are
presentation assumptions, not certified maintenance limits.

Scores use these presentation bands: `90-100 HEALTHY`, `75-89 CAUTION`,
`50-74 DEGRADED`, and `0-49 CRITICAL`. Health uses an exponential residual
penalty, a five-sample persistence window at the 1 Hz prototype rate, and
smoothing with alpha `0.30` so a current score contributes 30% of the displayed
value. Trend labels are `IMPROVING`, `STABLE`, or `DEGRADING`.

Sensor isolation compares persistent normalized residuals with related signals.
For example, a persistent CHT deviation with normal EGT, oil temperature, and
RPM supports `SENSOR_FAULT` rather than physical overheating. A classifier-
supported physical fault remains dominant when multiple correlated signals agree.
Sensor confidence is a consistency score from 0 to 1, not a calibrated
probability. No RUL, SHAP, health index ML model, or mission risk model is
implemented.

## Phase 6 Degradation and RUL

The degradation endpoint estimates component degradation from `100 - subsystem
health` and applies a rolling linear trend. The prototype EOL threshold is health
`50`, and the initial RUL equation is:

```text
RUL hours = (current physical health - EOL threshold) / degradation rate per hour
```

RUL also returns lower and upper bounds propagated from recent degradation-rate
variability, confidence, status, and an engineering explanation. These values
are simulation assumptions, not operational aircraft maintenance limits.

Current endpoints:

* `GET http://localhost:8080/api/degradation/current`
* `GET http://localhost:8080/api/rul/current`
* `POST http://localhost:8000/degradation/evaluate`

Replay generated trajectories sequentially without using future samples:

```sh
python scripts/replay_rul.py \
  --input-dir data/generated \
  --output-dir data/generated/rul
```

Replay writes health, degradation, RUL bounds, confidence, trend, and diagnostic
status for future visualization. Physical scenarios are scored against the
synthetic EOL boundary at the end of the configured severity ramp. Sensor drift
is excluded from physical RUL error scoring; it reduces confidence and returns
`STABLE` or `UNRELIABLE` rather than a fabricated catastrophic RUL.

RUL is a prototype estimate derived from synthetic physics-constrained
degradation trajectories and is not an operational aircraft maintenance
prediction.

## Core Pipeline

Telemetry
→ Sensor Processing
→ State Estimation
→ Physics Twin
→ Expected State
→ Physics Residuals
→ Anomaly Detection
→ Fault Classification
→ Health Estimation
→ RUL
→ Mission Reliability
→ Operator Decision

## Prototype Principle

The SIH prototype uses a physics-constrained simulated engine because
large real-world engine failure datasets are not assumed to be available.

The system must not make unsupported claims about real-world prediction
accuracy.
