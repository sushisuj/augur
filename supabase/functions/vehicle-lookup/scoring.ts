/**
 * scoring.ts — Augur Purchase Risk Algorithm
 *
 * Computes a 0–100 score representing purchase risk for a used vehicle.
 * 100 = very low risk, 0 = walk away immediately.
 *
 * Score = 100
 *       − clockingPenalty           (instant 0 if detected)
 *       − recurringFailurePenalty   (baseWeight × recurrenceMultiplier × recencyFactor)
 *       − persistentAdvisoryPenalty (weight × extra occurrences beyond first)
 *       − modelReliabilityPenalty   (capped at 25, scaled by severity)
 *       + consistencyBonus          (up to +10 for consecutive clean MOTs)
 *
 * All inputs come from external sources (MOT History API, DVSA DB).
 * This module is pure logic — no API calls, no side effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RFR = {
  text: string;
  type: "FAIL" | "ADVISORY" | "PRS" | string;
  dangerous?: boolean;
};

export type MOTTest = {
  completedDate: string;       // ISO date, e.g. "2024-03-15.000Z"
  testResult: string;          // "PASSED" | "FAILED"
  odometerValue?: string;
  odometerUnit?: string;
  rfrAndComments?: RFR[];
};

export type ModelFault = {
  fault_description: string;
  fault_category: string;
  severity: "High" | "Medium" | "Low";
  source: string;
  provenance?: string;
};

export type RecurringFault = {
  description: string;
  type: "failure" | "advisory";
  occurrences: number;
  mostRecentDate: string;
  dangerous: boolean;
};

export type ScoringFlags = {
  clockingDetected: boolean;
  recurringFailures: RecurringFault[];   // failures appearing 2+ times
  persistentAdvisories: RecurringFault[]; // advisories appearing 2+ times
  consistencyBonus: number;
  cleanStreak: number;                   // consecutive clean MOTs from most recent
};

export type ScoreBreakdown = {
  base: 100;
  clockingDeduction: number;
  recurringFailureDeduction: number;
  persistentAdvisoryDeduction: number;
  modelReliabilityDeduction: number;
  consistencyBonus: number;
  final: number;
};

export type ScoringResult = {
  score: number;
  verdict: "Buy" | "Consider" | "Avoid";
  flags: ScoringFlags;
  breakdown: ScoreBreakdown;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Base penalty per failure instance (before multipliers)
const FAILURE_BASE: Record<string, number> = {
  dangerous: 14,   // rfr.dangerous = true — safety critical
  regular: 8,      // standard MOT failure
};

// Persistent advisory base penalty per extra occurrence (beyond first)
const ADVISORY_PENALTY_PER_RECURRENCE = 3;

// Model-wide fault penalties by severity (capped at MAX_MODEL_PENALTY total)
const MODEL_PENALTY: Record<string, number> = {
  High: 5,
  Medium: 3,
  Low: 1,
};
const MAX_MODEL_PENALTY = 25;

// Recency factor: how much weight a failure carries based on how long ago it occurred
function recencyFactor(dateStr: string): number {
  const testDate = new Date(dateStr);
  const now = new Date();
  const yearsAgo = (now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (yearsAgo < 1) return 1.0;
  if (yearsAgo < 3) return 0.7;
  return 0.4;
}

// Recurrence multiplier: each additional occurrence adds 50% more weight
// 1 occurrence → ×1.0, 2 → ×1.5, 3 → ×2.0, 4 → ×2.5
function recurrenceMultiplier(occurrences: number): number {
  return 1 + (0.5 * (occurrences - 1));
}

// ── Mileage clocking detection ────────────────────────────────────────────────

function toMiles(value: number, unit: string): number {
  return unit.toUpperCase() === "KM" ? Math.round(value * 0.621371) : value;
}

function detectClocking(motTests: MOTTest[]): boolean {
  const readings = motTests
    .filter((t) => t.odometerValue)
    .map((t) => ({
      date: t.completedDate ?? "",
      // Normalise to miles — km readings alongside miles readings would otherwise
      // create false decreases (e.g. 50,961 km after 45,030 miles looks fine raw,
      // but mixed units corrupt comparisons further down the history)
      mileage: toMiles(parseInt(t.odometerValue!), t.odometerUnit ?? "MI"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 1; i < readings.length; i++) {
    if (readings[i].mileage < readings[i - 1].mileage) return true;
  }
  return false;
}

// ── Fault recurrence analysis ─────────────────────────────────────────────────

/**
 * Groups failures and advisories by description across all MOT tests.
 * Returns faults that appear more than once — these are recurring issues.
 *
 * Uses exact string matching. Gemini semantic clustering (combined with the
 * summary prompt) handles near-duplicate descriptions upstream in index.ts.
 */
function analyseRecurrence(motTests: MOTTest[]): {
  allFailures: Map<string, RecurringFault>;
  allAdvisories: Map<string, RecurringFault>;
} {
  const allFailures = new Map<string, RecurringFault>();
  const allAdvisories = new Map<string, RecurringFault>();

  // motTests comes newest-first from the API
  // We iterate all tests to count occurrences across full history
  for (const test of motTests) {
    const date = test.completedDate?.substring(0, 10) ?? "Unknown";

    for (const rfr of (test.rfrAndComments ?? [])) {
      const text = (rfr.text ?? "").trim();
      if (!text) continue;

      const key = text.toLowerCase();
      const isDangerous = rfr.dangerous ?? false;

      if (rfr.type === "FAIL") {
        const existing = allFailures.get(key);
        if (!existing) {
          allFailures.set(key, {
            description: text,
            type: "failure",
            occurrences: 1,
            mostRecentDate: date,
            dangerous: isDangerous,
          });
        } else {
          // Keep most recent date (tests are newest-first, so first seen = most recent)
          allFailures.set(key, {
            ...existing,
            occurrences: existing.occurrences + 1,
            dangerous: existing.dangerous || isDangerous,
          });
        }
      }

      if (rfr.type === "ADVISORY") {
        const existing = allAdvisories.get(key);
        if (!existing) {
          allAdvisories.set(key, {
            description: text,
            type: "advisory",
            occurrences: 1,
            mostRecentDate: date,
            dangerous: false,
          });
        } else {
          allAdvisories.set(key, {
            ...existing,
            occurrences: existing.occurrences + 1,
          });
        }
      }
    }
  }

  return { allFailures, allAdvisories };
}

// ── Consistency bonus ─────────────────────────────────────────────────────────

/**
 * Counts consecutive passed MOTs from most recent backwards.
 * A clean streak rewards well-maintained vehicles regardless of age —
 * a 2002 car with 10 straight passes is more trustworthy than a 2020 car
 * with 2 passes and a failure.
 */
function computeCleanStreak(motTests: MOTTest[]): number {
  let streak = 0;
  // motTests is newest-first
  for (const test of motTests) {
    if (test.testResult === "PASSED") {
      streak++;
    } else {
      break; // streak ends at first failure going back in time
    }
  }
  return streak;
}

// ── Main scoring function ─────────────────────────────────────────────────────

export function computeScore(
  motTests: MOTTest[],
  modelFaults: ModelFault[]
): ScoringResult {

  // ── 1. Clocking — instant 0, no negotiation ────────────────────────────────
  const clockingDetected = detectClocking(motTests);
  if (clockingDetected) {
    return {
      score: 0,
      verdict: "Avoid",
      flags: {
        clockingDetected: true,
        recurringFailures: [],
        persistentAdvisories: [],
        consistencyBonus: 0,
        cleanStreak: 0,
      },
      breakdown: {
        base: 100,
        clockingDeduction: 100,
        recurringFailureDeduction: 0,
        persistentAdvisoryDeduction: 0,
        modelReliabilityDeduction: 0,
        consistencyBonus: 0,
        final: 0,
      },
    };
  }

  // ── 2. Analyse fault recurrence ────────────────────────────────────────────
  const { allFailures, allAdvisories } = analyseRecurrence(motTests);

  // ── 3. Recurring failure penalty ───────────────────────────────────────────
  let recurringFailureDeduction = 0;
  const recurringFailures: RecurringFault[] = [];

  for (const fault of allFailures.values()) {
    const base = fault.dangerous ? FAILURE_BASE.dangerous : FAILURE_BASE.regular;
    const penalty = base
      * recurrenceMultiplier(fault.occurrences)
      * recencyFactor(fault.mostRecentDate);

    recurringFailureDeduction += penalty;

    // Flag for UI if it appears more than once
    if (fault.occurrences > 1) {
      recurringFailures.push(fault);
    }
  }

  // ── 4. Persistent advisory penalty ────────────────────────────────────────
  // First occurrence is free — it's a heads-up. Repeated = owner negligence.
  let persistentAdvisoryDeduction = 0;
  const persistentAdvisories: RecurringFault[] = [];

  for (const advisory of allAdvisories.values()) {
    if (advisory.occurrences > 1) {
      const extraOccurrences = advisory.occurrences - 1;
      persistentAdvisoryDeduction += ADVISORY_PENALTY_PER_RECURRENCE * extraOccurrences;
      persistentAdvisories.push(advisory);
    }
  }

  // ── 5. Model reliability penalty (capped) ─────────────────────────────────
  let modelReliabilityDeduction = 0;

  for (const fault of modelFaults) {
    const penalty = MODEL_PENALTY[fault.severity] ?? 1;
    modelReliabilityDeduction += penalty;
  }

  // Cap so that aggregate model data alone can't floor the score
  modelReliabilityDeduction = Math.min(modelReliabilityDeduction, MAX_MODEL_PENALTY);

  // ── 6. Consistency bonus ───────────────────────────────────────────────────
  const cleanStreak = computeCleanStreak(motTests);
  const consistencyBonus = Math.min(10, Math.floor(cleanStreak * 1.5));

  // ── 7. Final score ─────────────────────────────────────────────────────────
  const raw = 100
    - recurringFailureDeduction
    - persistentAdvisoryDeduction
    - modelReliabilityDeduction
    + consistencyBonus;

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const verdict: "Buy" | "Consider" | "Avoid" =
    score >= 75 ? "Buy" : score >= 50 ? "Consider" : "Avoid";

  return {
    score,
    verdict,
    flags: {
      clockingDetected: false,
      recurringFailures,
      persistentAdvisories,
      consistencyBonus,
      cleanStreak,
    },
    breakdown: {
      base: 100,
      clockingDeduction: 0,
      recurringFailureDeduction: Math.round(recurringFailureDeduction),
      persistentAdvisoryDeduction: Math.round(persistentAdvisoryDeduction),
      modelReliabilityDeduction: Math.round(modelReliabilityDeduction),
      consistencyBonus,
      final: score,
    },
  };
}

export function scoreToVerdict(score: number): "Buy" | "Consider" | "Avoid" {
  if (score >= 75) return "Buy";
  if (score >= 50) return "Consider";
  return "Avoid";
}
