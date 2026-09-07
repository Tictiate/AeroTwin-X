"""Simplified atmosphere calculations used by the physics twin."""

from dataclasses import dataclass
import math

from .constants import R_SPECIFIC_AIR, SEA_LEVEL_PRESSURE_PA


@dataclass(frozen=True)
class Environment:
    ambient_temperature_c: float
    pressure_pa: float
    density_kg_m3: float


def estimate_environment(altitude_m: float, ambient_temperature_c: float) -> Environment:
    """Estimate pressure and density using an exponential prototype atmosphere."""
    absolute_temperature_k = ambient_temperature_c + 273.15
    pressure_pa = SEA_LEVEL_PRESSURE_PA * math.exp(-0.00012 * altitude_m)
    density_kg_m3 = pressure_pa / (R_SPECIFIC_AIR * absolute_temperature_k)
    return Environment(ambient_temperature_c, pressure_pa, density_kg_m3)
