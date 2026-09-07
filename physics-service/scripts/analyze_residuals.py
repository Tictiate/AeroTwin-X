#!/usr/bin/env python3
"""Summarize residual signatures in a generated CSV dataset."""

import argparse
import csv
from collections import defaultdict
from pathlib import Path

RESIDUALS = (
    "rpmResidual", "egtResidual", "chtResidual", "oilTemperatureResidual",
    "oilPressureResidual", "fuelFlowResidual", "vibrationResidual",
)


def slope(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    x_mean = (len(values) - 1) / 2.0
    y_mean = sum(values) / len(values)
    numerator = sum((index - x_mean) * (value - y_mean) for index, value in enumerate(values))
    denominator = sum((index - x_mean) ** 2 for index in range(len(values)))
    return numerator / denominator if denominator else 0.0


def summarize(path: Path) -> None:
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    with path.open(newline="") as source:
        for row in csv.DictReader(source):
            scenario = row["faultType"]
            for field in RESIDUALS:
                grouped[scenario][field].append(float(row[field]))

    for scenario, fields in grouped.items():
        print(scenario)
        for field, values in fields.items():
            mean = sum(values) / len(values)
            standard_deviation = (
                sum((value - mean) ** 2 for value in values) / len(values)
            ) ** 0.5
            maximum = max(abs(value) for value in values)
            print(
                f"  {field}: mean={mean:.4f} std={standard_deviation:.4f} "
                f"max_abs={maximum:.4f} trend={slope(values):.6f}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    summarize(args.csv_path)


if __name__ == "__main__":
    main()
