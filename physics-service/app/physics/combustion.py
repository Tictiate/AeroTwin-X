"""Fuel and combustion proxies for the reduced-order twin."""

from .constants import FUEL_DENSITY_KG_PER_L


def estimate_fuel_flow(
    air_flow_kg_h: float, throttle: float, load: float
) -> tuple[float, float]:
    """Return fuel flow in kg/h and L/h from air flow and commanded AFR."""
    air_fuel_ratio = 14.7 - (2.0 * throttle) + (0.5 * load)
    fuel_flow_kg_h = air_flow_kg_h / air_fuel_ratio
    return fuel_flow_kg_h, fuel_flow_kg_h / FUEL_DENSITY_KG_PER_L


def estimate_egt_c(
    ambient_temperature_c: float,
    fuel_flow_kg_h: float,
    throttle: float,
    load: float,
    air_density_kg_m3: float,
) -> float:
    """Estimate EGT from fuel heat release and density-based cooling."""
    heat_release_proxy = fuel_flow_kg_h * 43000.0
    cooling_factor = max(0.75, min(1.25, air_density_kg_m3 / 1.225))
    egt_c = ambient_temperature_c + (heat_release_proxy / 1000.0) / cooling_factor
    # Prototype assumption: load adds heat demand even when it reduces the
    # steady-state RPM operating point.
    egt_c += (10.0 * throttle) + (120.0 * load)
    return egt_c
