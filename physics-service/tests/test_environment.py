from app.physics.environment import estimate_environment


def test_density_decreases_with_altitude():
    sea_level = estimate_environment(0.0, 15.0)
    high_altitude = estimate_environment(6000.0, 15.0)

    assert sea_level.pressure_pa > high_altitude.pressure_pa
    assert sea_level.density_kg_m3 > high_altitude.density_kg_m3


def test_density_uses_celsius_to_kelvin_conversion():
    environment = estimate_environment(0.0, 15.0)

    assert environment.density_kg_m3 == 101325.0 / (287.05 * 288.15)