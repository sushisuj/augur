/**
 * scoring.test.ts — Manual test runner for the Augur scoring algorithm
 * Run with: deno run scoring.test.ts
 */

import { computeScore, MOTTest, ModelFault } from "./scoring.ts";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function run(label: string, fn: () => void) {
  console.log(`\n${label}`);
  fn();
}

// ── Test data helpers ─────────────────────────────────────────────────────────

function makePass(date: string, mileage: number, advisories: string[] = []): MOTTest {
  return {
    completedDate: date,
    testResult: "PASSED",
    odometerValue: String(mileage),
    odometerUnit: "MI",
    rfrAndComments: advisories.map((text) => ({ text, type: "ADVISORY" })),
  };
}

function makeFail(date: string, mileage: number, failures: string[], dangerous = false): MOTTest {
  return {
    completedDate: date,
    testResult: "FAILED",
    odometerValue: String(mileage),
    odometerUnit: "MI",
    rfrAndComments: failures.map((text) => ({ text, type: "FAIL", dangerous })),
  };
}

const NO_FAULTS: ModelFault[] = [];

// ── Tests ─────────────────────────────────────────────────────────────────────

run("Clocking detection — instant 0", () => {
  // Mileage goes: 80k → 60k (decrease = clocking)
  const motTests: MOTTest[] = [
    makePass("2024-01-01", 60000), // most recent — newer but lower
    makePass("2022-01-01", 80000), // older but higher
  ];
  const result = computeScore(motTests, NO_FAULTS);
  assert("score is 0", result.score === 0);
  assert("verdict is Avoid", result.verdict === "Avoid");
  assert("clockingDetected flag is true", result.flags.clockingDetected === true);
  assert("breakdown shows clockingDeduction of 100", result.breakdown.clockingDeduction === 100);
});

run("Clean vehicle with no history", () => {
  const result = computeScore([], NO_FAULTS);
  assert("score is 100", result.score === 100);
  assert("verdict is Buy", result.verdict === "Buy");
  assert("no clocking", result.flags.clockingDetected === false);
});

run("Consistent clean streak bonus", () => {
  const motTests: MOTTest[] = [
    makePass("2024-01-01", 90000),
    makePass("2023-01-01", 80000),
    makePass("2022-01-01", 70000),
    makePass("2021-01-01", 60000),
    makePass("2020-01-01", 50000),
  ];
  const result = computeScore(motTests, NO_FAULTS);
  assert("cleanStreak is 5", result.flags.cleanStreak === 5);
  assert("consistencyBonus is 7 (floor(5 * 1.5) = 7, capped at 10)", result.flags.consistencyBonus === 7);
  assert("score is 107 capped to 100", result.score === 100);
});

run("Single failure (no recurrence) — one-off, moderate deduction", () => {
  const motTests: MOTTest[] = [
    makePass("2024-01-01", 90000),
    makeFail("2023-01-01", 80000, ["Brake discs worn beyond limit"]),
    makePass("2022-01-01", 70000),
  ];
  const result = computeScore(motTests, NO_FAULTS);
  // Only 1 occurrence so no recurring flag, but still penalised
  assert("no recurring failures flagged", result.flags.recurringFailures.length === 0);
  assert("score is less than 100", result.score < 100);
  assert("score is above 50 (single non-dangerous failure)", result.score > 50);
});

run("Recurring failure — same fault twice", () => {
  const motTests: MOTTest[] = [
    makeFail("2024-01-01", 90000, ["Brake discs worn beyond limit"]),
    makePass("2023-01-01", 80000),
    makeFail("2022-01-01", 70000, ["Brake discs worn beyond limit"]),
  ];
  const result = computeScore(motTests, NO_FAULTS);
  assert("recurring failure is flagged", result.flags.recurringFailures.length === 1);
  assert("flagged fault has 2 occurrences", result.flags.recurringFailures[0].occurrences === 2);
  assert("recurringFailureDeduction is positive", result.breakdown.recurringFailureDeduction > 0);
});

run("Persistent advisory — same advisory twice", () => {
  const motTests: MOTTest[] = [
    makePass("2024-01-01", 90000, ["Tyre slightly worn on nearside front"]),
    makePass("2023-01-01", 80000, ["Tyre slightly worn on nearside front"]),
  ];
  const result = computeScore(motTests, NO_FAULTS);
  assert("persistent advisory flagged", result.flags.persistentAdvisories.length === 1);
  assert("advisory has 2 occurrences", result.flags.persistentAdvisories[0].occurrences === 2);
  assert("persistentAdvisoryDeduction is 3 (1 extra × 3)", result.breakdown.persistentAdvisoryDeduction === 3);
});

run("Advisory appearing once — no penalty (it's just a heads-up)", () => {
  const motTests: MOTTest[] = [
    makePass("2024-01-01", 90000, ["Tyre slightly worn on nearside front"]),
  ];
  const result = computeScore(motTests, NO_FAULTS);
  assert("no persistent advisories", result.flags.persistentAdvisories.length === 0);
  assert("no advisory deduction", result.breakdown.persistentAdvisoryDeduction === 0);
});

run("Dangerous recurring failure — higher penalty", () => {
  const motTests: MOTTest[] = [
    makeFail("2024-01-01", 90000, ["Steering rack seized"], true),  // dangerous
    makeFail("2022-01-01", 70000, ["Steering rack seized"], true),  // dangerous
  ];
  const result = computeScore(motTests, NO_FAULTS);
  // dangerous base = 14, recurrenceMultiplier(2) = 1.5, recencyFactor(<1yr) = 1.0
  // = 14 * 1.5 = 21
  assert("dangerous flag set on recurring failure", result.flags.recurringFailures[0].dangerous === true);
  assert("deduction is higher than regular (>12)", result.breakdown.recurringFailureDeduction > 12);
});

run("Model reliability capped at 25", () => {
  const modelFaults: ModelFault[] = Array.from({ length: 20 }, (_, i) => ({
    fault_description: `Fault ${i}`,
    fault_category: "Engine",
    severity: "High",
    source: "DVSA",
    provenance: "model",
  }));
  const result = computeScore([], modelFaults);
  assert("modelReliabilityDeduction capped at 25", result.breakdown.modelReliabilityDeduction === 25);
  assert("score is 75 (100 - 25)", result.score === 75);
});

run("Verdict thresholds", () => {
  // Artificially construct breakdowns via model faults
  // 100 - 0 deductions = 100 → Buy
  assert("score 100 → Buy", computeScore([], []).verdict === "Buy");

  // Score around 60: use model faults totalling ~40 pts (capped at 25) + a few failures
  const lotsOfFaults: ModelFault[] = Array.from({ length: 10 }, (_, i) => ({
    fault_description: `Fault ${i}`,
    fault_category: "Engine",
    severity: "High",
    source: "DVSA",
    provenance: "model",
  }));
  const midResult = computeScore([], lotsOfFaults);
  assert("heavy model faults → Consider or worse", midResult.score <= 75);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) Deno.exit(1);
