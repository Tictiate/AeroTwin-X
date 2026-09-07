"""First-order thermal and lubrication proxies."""

from .constants import (
    CHT_RESPONSE_RATE,
    MAX_OIL_PRESSURE_KPA,
    MIN_OIL_PRESSURE_KPA,
    OIL_RESPONSE_RATE,
)


def first_order_update(previous: float, target: float, response_rate: float) -> float:
    return previous + response_rate * (target - previous)


def expected_cht_c(
    previous_cht_c: float, ambient_temperature_c: float, egt_c: float
) -> float:
    target_cht_c = ambient_temperature_c + (egt_c * 0.25)
    return first_order_update(previous_cht_c, target_cht_c, CHT_RESPONSE_RATE)


def expected_oil_temperature_c(
    previous_oil_temperature_c: float,
    ambient_temperature_c: float,
    rpm: float,
    load: float,
    altitude_m: float,
) -> float:
    cooling = max(0.2, 1.0 + altitude_m / 10000.0)
    target = ambient_temperature_c + ((rpm * 0.015) + (load * 20.0)) / cooling
    return first_order_update(previous_oil_temperature_c, target, OIL_RESPONSE_RATE)


def expected_oil_pressure_kpa(rpm: float, oil_temperature_c: float) -> float:
    pressure = 200.0 + (rpm * 0.05)
    if oil_temperature_c > 80.0:
        pressure -= (oil_temperature_c - 80.0) * 2.0
    return max(MIN_OIL_PRESSURE_KPA, min(MAX_OIL_PRESSURE_KPA, pressure))
