"""Reduced-order intake airflow relationships."""

from .constants import DISPLACEMENT_L, VOLUMETRIC_EFFICIENCY


def estimate_airflow_kg_h(rpm: float, density_kg_m3: float) -> float:
    """Estimate four-stroke intake air mass flow in kg/h."""
    volumetric_flow_m3_h = (
        (rpm / 2.0) * (DISPLACEMENT_L / 1000.0) * VOLUMETRIC_EFFICIENCY * 60.0
    )
    return volumetric_flow_m3_h * density_kg_m3
