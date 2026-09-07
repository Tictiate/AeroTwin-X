#!/usr/bin/env python3
"""Generate one Phase 3 scenario or the complete demonstration dataset."""

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.simulation.dataset_generator import DatasetConfig, generate_records, scenario_filename, write_csv
from app.simulation.fault_models import FaultType


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scenario",
        choices=[fault.value for fault in FaultType] + ["ALL"],
        default="ALL",
    )
    parser.add_argument("--duration-seconds", type=int, default=300)
    parser.add_argument("--sample-rate-hz", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--runs-per-scenario", type=int, default=1)
    parser.add_argument("--output-dir", type=Path, default=Path("data/generated"))
    args = parser.parse_args()

    scenarios = list(FaultType) if args.scenario == "ALL" else [FaultType(args.scenario)]
    combined: list[dict[str, object]] = []
    if args.runs_per_scenario <= 0:
        parser.error("--runs-per-scenario must be positive")
    for scenario in scenarios:
        scenario_records: list[dict[str, object]] = []
        for run_id in range(args.runs_per_scenario):
            records = generate_records(DatasetConfig(
                scenario=scenario,
                duration_seconds=args.duration_seconds,
                sample_rate_hz=args.sample_rate_hz,
                seed=args.seed + run_id,
                run_id=run_id,
            ))
            scenario_records.extend(records)
        write_csv(scenario_records, args.output_dir / scenario_filename(scenario))
        combined.extend(scenario_records)
        print(f"{scenario.value}: {len(scenario_records)} samples across {args.runs_per_scenario} runs")

    if len(scenarios) > 1:
        write_csv(combined, args.output_dir / "aerotwin_training_dataset.csv")
        print(f"combined: {len(combined)} samples")


if __name__ == "__main__":
    main()
