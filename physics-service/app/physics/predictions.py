"""Physics prediction request and response contracts."""

from datetime import datetime
import math
from typing import Literal

from pydantic import BaseModel, Field

from .airflow import estimate_airflow_kg_h
from .combustion import estimate_egt_c, estimate_fuel_flow
from .constants import MAX_EXPECTED_EGT_C
from .engine_model import expected_rpm
from .environment import estimate_environment
from .thermal import (
    expected_cht_c,
    expected_oil_pressure_kpa,
    expected_oil_temperature_c,
)

MissionPhase = Literal["IDLE", "TAKEOFF", "CLIMB", "CRUISE", "LOITER", "DESCENT", "LANDING"]


class TelemetryInput(BaseModel):
    timestamp: datetime
    engineId: str = Field(min_length=1)
    missionId: str = Field(min_length=1)
    missionPhase: MissionPhase
    altitude: float = Field(ge=0.0, le=20000.0)
    ambientTemperature: float = Field(ge=-90.0, le=70.0)
    throttle: float = Field(ge=0.0, le=1.0)
    load: float = Field(ge=0.0, le=1.0)
    rpm: float = Field(ge=0.0)
    egt: float
    cht: float
    oilTemperature: float
    oilPressure: float
    fuelFlow: float = Field(ge=0.0)
    vibration: float = Field(ge=0.0)
    batteryVoltage: float = Field(ge=0.0)


class PhysicsPrediction(BaseModel):
    expectedRpm: float
    expectedEgt: float
    expectedCht: float
    expectedOilTemperature: float
    expectedOilPressure: float
    expectedFuelFlow: float
    expectedVibration: float
    expectedBatteryVoltage: float


def predict_healthy_state(telemetry: TelemetryInput) -> PhysicsPrediction:
    environment = estimate_environment(telemetry.altitude, telemetry.ambientTemperature)
    rpm = expected_rpm(
        telemetry.throttle,
        telemetry.load,
        environment.density_kg_m3,
        telemetry.missionPhase,
    )
    air_flow = estimate_airflow_kg_h(rpm, environment.density_kg_m3)
    fuel_flow_kg_h, fuel_flow_l_h = estimate_fuel_flow(
        air_flow, telemetry.throttle, telemetry.load
    )
    egt = min(
        MAX_EXPECTED_EGT_C,
        estimate_egt_c(
            telemetry.ambientTemperature,
            fuel_flow_kg_h,
            telemetry.throttle,
            telemetry.load,
            environment.density_kg_m3,
        ),
    )
    cht = expected_cht_c(telemetry.cht, telemetry.ambientTemperature, egt)
    oil_temperature = expected_oil_temperature_c(
        telemetry.oilTemperature,
        telemetry.ambientTemperature,
        rpm,
        telemetry.load,
        telemetry.altitude,
    )
    oil_pressure = expected_oil_pressure_kpa(rpm, oil_temperature)
    time_seconds = telemetry.timestamp.timestamp()
    vibration = (rpm / 1000.0) * 1.5 + (telemetry.load * 2.0)
    vibration += 0.5 * math.cos(time_seconds * 5.0)

    return PhysicsPrediction(
        expectedRpm=rpm,
        expectedEgt=egt,
        expectedCht=cht,
        expectedOilTemperature=oil_temperature,
        expectedOilPressure=oil_pressure,
        expectedFuelFlow=fuel_flow_l_h,
        expectedVibration=max(0.0, vibration),
        expectedBatteryVoltage=14.2,
    )
