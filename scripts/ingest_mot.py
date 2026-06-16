#!/usr/bin/env python3
"""
DVSA MOT Bulk Data Ingestion Script
====================================
Reads all monthly DVSA MOT data files, joins them on test_id,
and outputs mot_aggregate.csv ready for Supabase import.

Usage
-----
    python ingest_mot.py \
        --results  "C:/path/to/results/test_result_*.csv" \
        --failures "C:/path/to/failures/test_item_*.csv" \
        --output   mot_aggregate.csv

    # Optional: supply rfr lookup file for human-readable fault descriptions
    python ingest_mot.py ... --rfr-lookup path/to/dft_rfr.csv

    # Quick sanity check on a single month first:
    python ingest_mot.py \
        --results  "C:/path/test_result_202401.csv" \
        --failures "C:/path/test_item_202401.csv" \
        --output   mot_aggregate_jan_only.csv

Column expectations
-------------------
  results:  test_id, vehicle_id, test_date, test_class_id, test_type,
            test_result, test_mileage, postcode_area, make, model,
            colour, fuel_type, cylinder_capacity, first_use_date, completed_date

  failures: test_id, rfr_id, rfr_type_code, mot_test_rfr_location_type_id,
            dangerous_mark, completed_date

  rfr_lookup (optional): rfr_id, rfr_text
            If absent, failure_reason will be the numeric rfr_id.
            You can join with a lookup later once you have the file.

Output schema  →  mot_aggregate table in Supabase
--------------------------------------------------
  make, model, year_from, year_to,
  failure_reason, rfr_id, rfr_type_code, severity,
  frequency, pass_rate, total_tests
"""

import argparse
import csv
import glob
import sys
from collections import defaultdict
from pathlib import Path

# Some DVSA CSV fields exceed the default limit — use max safe value for Windows
csv.field_size_limit(2**31 - 1)

# ── Tunables ──────────────────────────────────────────────────────────────────
MIN_TESTS    = 50   # drop groups with fewer tests (too noisy)
TOP_N_FAULTS = 10   # top N rfr_ids to emit per make/model/year bracket

# rfr_type_code → severity
# F = Major Failure, D = Dangerous, M = Minor, A = Advisory, P = PRS
RFR_SEVERITY: dict[str, str] = {
    "F": "High",
    "D": "High",
    "M": "Low",
    "A": "Low",
    "P": "Low",
}

PASS_VALUES = {"P", "PASS", "PASSED"}

# Classes to include: 4 = private/light goods, 5 = larger private passenger
INCLUDE_CLASSES = {"4", "5"}

# Normal test types (skip retests to avoid double-counting)
NORMAL_TEST_TYPES = {"NT", "NORMAL TEST", ""}


# ── Normalisation ─────────────────────────────────────────────────────────────

MAKE_ALIASES: dict[str, str] = {
    "VW":              "VOLKSWAGEN",
    "MERCEDES BENZ":   "MERCEDES-BENZ",
    "MERCEDES":        "MERCEDES-BENZ",
}

TRIM_WORDS = {
    "edition", "sport", "se", "limited", "premium", "plus", "pro",
    "elite", "executive", "titanium", "zetec", "ghia", "lx", "ex",
    "dx", "active", "design", "line", "cross", "style", "motion",
    "estate", "hatchback", "saloon", "coupe", "convertible", "mpv",
}


def normalise_make(raw: str) -> str:
    s = raw.strip().upper()
    return MAKE_ALIASES.get(s, s)


def normalise_model(raw: str) -> str:
    words = raw.strip().split()
    meaningful = [w for w in words if w.lower() not in TRIM_WORDS]
    return " ".join(meaningful[:2]).upper() if meaningful else raw.strip().upper()


def year_bracket(year: int) -> tuple[int, int]:
    """Round down to nearest 5-year bracket: 2018 → (2015, 2019)."""
    base = (year // 5) * 5
    return base, base + 4


def resolve_paths(pattern: str) -> list[Path]:
    """Expand glob pattern; also accept a literal path."""
    paths = [Path(p) for p in glob.glob(pattern, recursive=False)]
    if not paths:
        # Try treating it as a literal path
        p = Path(pattern)
        if p.exists():
            paths = [p]
    return sorted(paths)


# ── Main ──────────────────────────────────────────────────────────────────────

def load_rfr_lookup(path: str) -> dict[str, str]:
    lookup: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        print(f"  RFR lookup columns: {header}")
        for row in reader:
            if len(row) >= 2:
                lookup[row[0].strip()] = row[1].strip()
    print(f"  Loaded {len(lookup):,} RFR descriptions.")
    return lookup


def main() -> None:
    parser = argparse.ArgumentParser(description="DVSA MOT bulk data ingestion")
    parser.add_argument("--results",    required=True,
                        help='Glob pattern for test results CSVs, e.g. "path/test_result_*.csv"')
    parser.add_argument("--failures",   required=True,
                        help='Glob pattern for failure items CSVs, e.g. "path/test_item_*.csv"')
    parser.add_argument("--output",     default="mot_aggregate.csv")
    parser.add_argument("--rfr-lookup", default=None,
                        help="Optional rfr_id → description lookup CSV")
    args = parser.parse_args()

    result_files  = resolve_paths(args.results)
    failure_files = resolve_paths(args.failures)

    if not result_files:
        print(f"ERROR: no result files matched: {args.results}", file=sys.stderr)
        sys.exit(1)
    if not failure_files:
        print(f"ERROR: no failure files matched: {args.failures}", file=sys.stderr)
        sys.exit(1)

    print(f"Result files  ({len(result_files):2d}): {[f.name for f in result_files]}")
    print(f"Failure files ({len(failure_files):2d}): {[f.name for f in failure_files]}")

    # Optional rfr lookup
    rfr_text: dict[str, str] = {}
    if args.rfr_lookup:
        print("\nLoading RFR lookup file...")
        rfr_text = load_rfr_lookup(args.rfr_lookup)

    # ── Pass 1: load ALL failure items into memory ────────────────────────────
    print("\nPass 1: Loading failure items (all months)...")
    # test_id → list of (rfr_id, rfr_type_code, is_dangerous)
    test_failures: dict[str, list[tuple[str, str, bool]]] = defaultdict(list)
    total_failure_rows = 0

    for fpath in failure_files:
        print(f"  Reading {fpath.name}  ({fpath.stat().st_size // 1024:,} KB)")
        with open(fpath, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                tid       = row["test_id"].strip()
                rfr_id    = row["rfr_id"].strip()
                rfr_type  = row["rfr_type_code"].strip().upper()
                dangerous = row.get("dangerous_mark", "").strip().upper() == "D"
                test_failures[tid].append((rfr_id, rfr_type, dangerous))
                total_failure_rows += 1

        print(f"    → {total_failure_rows:,} failure rows so far, "
              f"{len(test_failures):,} unique test_ids")

    print(f"\nPass 1 done. {len(test_failures):,} test_ids have at least one failure item.")

    # ── Pass 2: process test results (all months) ─────────────────────────────
    print("\nPass 2: Processing test results (all months)...")

    # agg key: (make, model, year_from, year_to)
    agg: dict[tuple, dict] = {}

    skipped_class   = 0
    skipped_type    = 0
    skipped_no_year = 0
    processed       = 0
    total_scanned   = 0

    for rpath in result_files:
        print(f"  Reading {rpath.name}  ({rpath.stat().st_size // 1024:,} KB)")
        with open(rpath, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            file_processed = 0
            for row in reader:
                total_scanned += 1

                test_class = row.get("test_class_id", "").strip()
                if test_class not in INCLUDE_CLASSES:
                    skipped_class += 1
                    continue

                test_type = row.get("test_type", "").strip().upper()
                if test_type not in NORMAL_TEST_TYPES:
                    skipped_type += 1
                    continue

                make_raw  = row.get("make", "").strip()
                model_raw = row.get("model", "").strip()
                if not make_raw or not model_raw:
                    continue

                make  = normalise_make(make_raw)
                model = normalise_model(model_raw)

                first_use = row.get("first_use_date", "").strip()
                if not first_use or len(first_use) < 4:
                    skipped_no_year += 1
                    continue
                try:
                    year = int(first_use[:4])
                except ValueError:
                    skipped_no_year += 1
                    continue

                if not (1980 <= year <= 2025):
                    continue

                yf, yt = year_bracket(year)
                key = (make, model, yf, yt)

                if key not in agg:
                    agg[key] = {"total": 0, "passes": 0, "rfr_counts": defaultdict(int)}

                agg[key]["total"] += 1
                processed         += 1
                file_processed    += 1

                result = row.get("test_result", "").strip().upper()
                if result in PASS_VALUES:
                    agg[key]["passes"] += 1

                tid = row["test_id"].strip()
                for rfr_id, rfr_type, dangerous in test_failures.get(tid, []):
                    severity = "High" if dangerous else RFR_SEVERITY.get(rfr_type, "Low")
                    agg[key]["rfr_counts"][(rfr_id, rfr_type, severity)] += 1

        print(f"    → {file_processed:,} rows accepted from this file  |  {len(agg):,} groups total")

    print(f"\nPass 2 done.")
    print(f"  Total scanned : {total_scanned:,}")
    print(f"  Accepted      : {processed:,}")
    print(f"  Skip class    : {skipped_class:,}")
    print(f"  Skip type     : {skipped_type:,}")
    print(f"  No year       : {skipped_no_year:,}")
    print(f"  Groups        : {len(agg):,}")

    # ── Pass 3: write output ──────────────────────────────────────────────────
    print(f"\nPass 3: Writing output to {args.output}...")

    fieldnames = [
        "make", "model", "year_from", "year_to",
        "failure_reason", "rfr_id", "rfr_type_code", "severity",
        "frequency", "pass_rate", "total_tests",
    ]

    output_rows   = []
    dropped_noisy = 0

    for (make, model, yf, yt), stats in agg.items():
        total = stats["total"]
        if total < MIN_TESTS:
            dropped_noisy += 1
            continue

        passes    = stats["passes"]
        pass_rate = round(passes / total, 4)

        sorted_rfrs = sorted(
            stats["rfr_counts"].items(),
            key=lambda x: x[1],
            reverse=True,
        )[:TOP_N_FAULTS]

        if sorted_rfrs:
            for (rfr_id, rfr_type, severity), count in sorted_rfrs:
                frequency   = round(count / total, 4)
                description = rfr_text.get(rfr_id, rfr_id)   # fall back to numeric ID
                output_rows.append({
                    "make":           make,
                    "model":          model,
                    "year_from":      yf,
                    "year_to":        yt,
                    "failure_reason": description,
                    "rfr_id":         rfr_id,
                    "rfr_type_code":  rfr_type,
                    "severity":       severity,
                    "frequency":      frequency,
                    "pass_rate":      pass_rate,
                    "total_tests":    total,
                })
        else:
            # No failures recorded — still emit for pass_rate
            output_rows.append({
                "make":           make,
                "model":          model,
                "year_from":      yf,
                "year_to":        yt,
                "failure_reason": None,
                "rfr_id":         None,
                "rfr_type_code":  None,
                "severity":       None,
                "frequency":      0.0,
                "pass_rate":      pass_rate,
                "total_tests":    total,
            })

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"  Dropped (< {MIN_TESTS} tests) : {dropped_noisy:,} groups")
    print(f"  Written                  : {len(output_rows):,} rows to {args.output}")
    print("\nDone.")


if __name__ == "__main__":
    main()
