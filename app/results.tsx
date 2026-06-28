import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_FUNCTION_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/vehicle-lookup";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  accent:      "#c2d635",
  danger:      "#e05530",
  warning:     "#e8a020",
  textPrimary: "#ffffff",
  textMuted:   "#888",
  textDim:     "#555",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Fault = {
  fault_description: string;
  fault_category: string;
  severity: string;
  source: string;
  provenance?: string;
};

type Recall = {
  recall_number: string;
  concern: string;
  defect: string;
  remedy: string;
  launch_date: string;
  build_start: string | null;
  build_end: string | null;
  provenance: string;
};

type MOTTest = {
  date: string;
  result: string;
  mileage: number | null;
  mileage_unit: string;
  failures: number;
  advisories: number;
};

type RecurringFault = {
  description: string;
  type: "failure" | "advisory";
  occurrences: number;
  mostRecentDate: string;
  dangerous: boolean;
};

type ScoringFlags = {
  clockingDetected: boolean;
  recurringFailures: RecurringFault[];
  persistentAdvisories: RecurringFault[];
  consistencyBonus: number;
  cleanStreak: number;
};

type ScoreBreakdown = {
  base: 100;
  clockingDeduction: number;
  recurringFailureDeduction: number;
  persistentAdvisoryDeduction: number;
  modelReliabilityDeduction: number;
  consistencyBonus: number;
  final: number;
};

type VehicleResult = {
  vehicle: { make: string; model: string; year: number; reg: string };
  score: number;
  verdict: string;
  summary: string;
  flags: ScoringFlags;
  breakdown: ScoreBreakdown;
  mot_history: MOTTest[];
  vehicle_issues: Fault[];
  model_faults: Fault[];
  fault_count: number;
  mileage_warning: string | null;
  population: { pass_rate: number; total_tests: number } | null;
  recalls: Recall[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/['''’]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/[�◆■￾]/g, "'");  // replacement chars → apostrophe
}

function verdictColor(verdict: string): string {
  if (verdict === "Buy")     return C.accent;
  if (verdict === "Consider") return C.warning;
  return C.danger;
}

const SEVERITY_COLOR: Record<string, string> = {
  High:   C.danger,
  Medium: C.warning,
  Low:    C.accent,
};

const PROVENANCE_COLOR: Record<string, string> = {
  "DVSA Recall":    C.danger,
  "Honest John":    "#8b5cf6",
  "Augur Research": "#3b82f6",
  "DVSA MOT":       C.accent,
};

function formatMileage(mileage: number | null, unit: string): string {
  if (mileage === null) return "Unknown";
  return `${mileage.toLocaleString()} ${unit === "KM" ? "km" : "mi"}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  "Fetching MOT history",
  "Checking active recalls",
  "Analysing fault patterns",
  "Generating buyer summary",
];

export default function ResultsScreen() {
  const { reg, vin } = useLocalSearchParams<{ reg: string; vin: string }>();
  const router = useRouter();
  const [data, setData]       = useState<VehicleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [motExpanded, setMotExpanded]     = useState(false);
  const [knownExpanded, setKnownExpanded] = useState(false);
  const [recallsExpanded, setRecallsExpanded] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("augur_persona").then((raw) => {
      const persona = raw ?? "none";
      if (vin)      fetchVehicle({ vin, persona });
      else if (reg) fetchVehicle({ reg, persona });
    });
  }, [reg, vin]);

  useEffect(() => {
    if (loading) {
      setLoadingStep(0);
      stepTimer.current = setInterval(() => {
        setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1));
      }, 1600);
    } else {
      if (stepTimer.current) clearInterval(stepTimer.current);
    }
    return () => { if (stepTimer.current) clearInterval(stepTimer.current); };
  }, [loading]);

  const fetchVehicle = async (params: { reg?: string; vin?: string; persona?: string }) => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (params.vin) qs.set("vin", params.vin);
    else if (params.reg) qs.set("reg", params.reg);
    if (params.persona && params.persona !== "none") qs.set("persona", params.persona);
    try {
      const res = await fetch(`${SUPABASE_FUNCTION_URL}?${qs}`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingReg}>{reg ?? vin}</Text>
        <View style={styles.loadingSteps}>
          {LOADING_STEPS.map((label, i) => {
            const done    = i < loadingStep;
            const current = i === loadingStep;
            return (
              <View key={i} style={styles.loadingStepRow}>
                <View style={[styles.loadingDot, done && styles.loadingDotDone, current && styles.loadingDotActive]}>
                  {done    && <Text style={styles.loadingCheck}>✓</Text>}
                  {current && <ActivityIndicator size={10} color={C.bg} />}
                </View>
                <Text style={[
                  styles.loadingStepText,
                  done    && styles.loadingStepDone,
                  current && styles.loadingStepActive,
                ]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load: {error}</Text>
      </View>
    );
  }

  if (!data) return null;

  const flags     = data.flags ?? { clockingDetected: false, recurringFailures: [], persistentAdvisories: [], consistencyBonus: 0, cleanStreak: 0 };
  const breakdown = data.breakdown;
  const vColor    = verdictColor(data.verdict);
  const passRate  = data.population?.pass_rate;

  // Detect clocking pairs for MOT history highlights
  const clockingRows = new Set<string>();
  if (data.mileage_warning) {
    const sorted = [...data.mot_history]
      .filter(t => t.mileage !== null && (t.mileage_unit ?? "MI").toUpperCase() === "MI")
      .map(t => ({ date: t.date, miles: t.mileage! }))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].miles - sorted[i].miles > 1000) {
        clockingRows.add(sorted[i - 1].date);
        clockingRows.add(sorted[i].date);
      }
    }
  }

  const PREVIEW = 3;
  const allFaults = [...(data.vehicle_issues ?? []), ...(data.model_faults ?? [])];

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 17, color: C.textPrimary }}>‹ Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Vehicle header ── */}
        <Text style={styles.vehicleHeader}>
          {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
          <Text style={styles.vehicleReg}>  ·  {data.vehicle.reg}</Text>
        </Text>

        {/* ── Score card ── */}
        <View style={[styles.glassCard, { borderColor: vColor, borderWidth: 1.5 }]}>
          <View style={styles.scoreRow}>
            <View style={[styles.scoreCircle, { borderColor: vColor }]}>
              <Text style={[styles.scoreNumber, { color: vColor }]}>{data.score}</Text>
              <Text style={[styles.scoreMax, { color: vColor }]}>/100</Text>
            </View>
            <View style={styles.scoreInfo}>
              <Text style={[styles.verdictLabel, { color: vColor }]}>{data.verdict.toUpperCase()}</Text>
              <Text style={styles.scoreSubtitle}>
                {flags.recurringFailures.length > 0
                  ? `${flags.recurringFailures.length} recurring failure${flags.recurringFailures.length > 1 ? "s" : ""}`
                  : data.recalls?.length > 0
                  ? `${data.recalls.length} active recall${data.recalls.length > 1 ? "s" : ""}`
                  : "No major issues found"}
              </Text>
              {breakdown && (
                <View style={styles.breakdownRow}>
                  {breakdown.recurringFailureDeduction > 0 && (
                    <Text style={styles.breakdownItem}>-{breakdown.recurringFailureDeduction} failures</Text>
                  )}
                  {breakdown.persistentAdvisoryDeduction > 0 && (
                    <Text style={styles.breakdownItem}>-{breakdown.persistentAdvisoryDeduction} advisories</Text>
                  )}
                  {breakdown.modelReliabilityDeduction > 0 && (
                    <Text style={styles.breakdownItem}>-{breakdown.modelReliabilityDeduction} reliability</Text>
                  )}
                  {breakdown.consistencyBonus > 0 && (
                    <Text style={[styles.breakdownItem, { color: C.accent }]}>+{breakdown.consistencyBonus} clean streak</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Stat cards ── */}
        <View style={styles.statRow}>
          <View style={[styles.glassCard, styles.statCard]}>
            <Text style={styles.statLabel}>MOT pass rate</Text>
            <Text style={[styles.statValue, { color: C.accent }]}>
              {passRate !== undefined && passRate !== null
                ? `${Math.round(passRate * 100)}%`
                : "N/A"}
            </Text>
          </View>
          <View style={[styles.glassCard, styles.statCard]}>
            <Text style={styles.statLabel}>Clean streak</Text>
            <Text style={styles.statValue}>
              {flags.cleanStreak}{" "}
              <Text style={styles.statUnit}>tests</Text>
            </Text>
          </View>
        </View>

        {/* ── Limited data warning ── */}
        {(data.population?.total_tests ?? 0) < 50 && (
          <View style={styles.limitedDataBanner}>
            <Text style={styles.limitedDataTitle}>
              {(data.population?.total_tests ?? 0) < 10 ? "Very limited data" : "Limited data"}
            </Text>
            <Text style={styles.limitedDataBody}>
              {(data.population?.total_tests ?? 0) < 10
                ? `Fewer than 10 MOT records exist for this model nationally. Pass rates and fault patterns are unreliable — treat this report as indicative only.`
                : `Only ${data.population?.total_tests ?? "a handful of"} MOT records exist for this model nationally. Reliability figures may not reflect the broader picture.`}
            </Text>
          </View>
        )}

        {/* ── Gemini summary ── */}
        <View style={styles.glassCard}>
          <Text style={styles.cardLabel}>Buyer Summary</Text>
          <Text style={styles.summaryText}>{cleanText(data.summary)}</Text>
        </View>

        {/* ── Expand buttons ── */}
        <View style={styles.expandButtonRow}>
          <TouchableOpacity
            style={[styles.expandToggleBtn, motExpanded && styles.expandToggleBtnActive]}
            onPress={() => setMotExpanded(!motExpanded)}
          >
            <Text style={[styles.expandToggleText, motExpanded && styles.expandToggleTextActive]}>
              {motExpanded ? "Hide MOT History" : "View MOT History"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandToggleBtn, knownExpanded && styles.expandToggleBtnActive]}
            onPress={() => setKnownExpanded(!knownExpanded)}
          >
            <Text style={[styles.expandToggleText, knownExpanded && styles.expandToggleTextActive]}>
              {knownExpanded ? "Hide Known Issues" : "View Known Issues"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── MOT History (expandable) ── */}
        {motExpanded && data.mot_history.length > 0 && (
          <View style={styles.glassCard}>
            <Text style={styles.cardLabel}>MOT History ({data.mot_history.length})</Text>
            {data.mot_history.map((test, i) => {
              const isFraud = clockingRows.has(test.date);
              return (
                <View key={i} style={[styles.motRow, isFraud && styles.motRowFraud]}>
                  <View>
                    <Text style={[styles.motDate, isFraud && { color: C.danger }]}>{test.date}</Text>
                    <Text style={[styles.motMileage, isFraud && { color: C.danger }]}>
                      {formatMileage(test.mileage, test.mileage_unit)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.motBadge, { backgroundColor: test.result === "PASSED" ? C.accent : C.danger }]}>
                      <Text style={styles.motBadgeText}>{test.result === "PASSED" ? "Pass" : "Fail"}</Text>
                    </View>
                    {(test.failures > 0 || test.advisories > 0) && (
                      <Text style={styles.motCounts}>
                        {test.failures > 0 ? `${test.failures}F ` : ""}
                        {test.advisories > 0 ? `${test.advisories}A` : ""}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Known Issues (expandable) ── */}
        {knownExpanded && allFaults.length > 0 && (
          <View style={styles.glassCard}>
            <Text style={styles.cardLabel}>Known Issues ({allFaults.length})</Text>
            {allFaults.map((fault, i) => (
              <View key={i} style={styles.faultRow}>
                <View style={styles.faultHeader}>
                  <Text style={styles.faultCategory}>{fault.fault_category}</Text>
                  <View style={styles.faultBadges}>
                    {fault.provenance && (
                      <View style={[styles.badge, { backgroundColor: PROVENANCE_COLOR[fault.provenance] ?? C.textDim }]}>
                        <Text style={styles.badgeText}>{fault.provenance}</Text>
                      </View>
                    )}
                    <View style={[styles.badge, { backgroundColor: SEVERITY_COLOR[fault.severity] ?? C.textDim }]}>
                      <Text style={styles.badgeText}>{fault.severity}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.faultDesc}>{cleanText(fault.fault_description)}</Text>
                {fault.source && <Text style={styles.faultSource}>{fault.source}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* ── Odometer fraud ── */}
        {data.mileage_warning && (
          <View style={[styles.glassCard, styles.dangerCard]}>
            <Text style={styles.dangerTitle}>Odometer Fraud Detected</Text>
            <Text style={styles.dangerBody}>{data.mileage_warning}</Text>
          </View>
        )}

        {/* ── Active recalls ── */}
        {data.recalls?.length > 0 && (
          <View style={[styles.glassCard, styles.dangerCard]}>
            <Text style={styles.dangerTitle}>
              Active Recall{data.recalls.length > 1 ? "s" : ""} ({data.recalls.length})
            </Text>
            <Text style={styles.dangerSubtitle}>
              Ask the seller whether this recall was completed — any main dealer can verify it against the VIN for free.
            </Text>
            {(recallsExpanded ? data.recalls : data.recalls.slice(0, PREVIEW)).map((r, i) => (
              <View key={i} style={styles.recallItem}>
                <Text style={styles.recallConcern}>{cleanText(r.concern)}</Text>
                <Text style={styles.recallDefect}>{cleanText(r.defect)}</Text>
                <Text style={styles.recallMeta}>
                  Recall {r.recall_number}
                  {r.build_start ? `  ·  Builds ${r.build_start} – ${r.build_end ?? "onwards"}` : ""}
                </Text>
              </View>
            ))}
            {data.recalls.length > PREVIEW && (
              <TouchableOpacity style={styles.expandBtn} onPress={() => setRecallsExpanded(!recallsExpanded)}>
                <Text style={styles.expandBtnText}>{recallsExpanded ? "Show less" : `Show all ${data.recalls.length}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Recurring failures ── */}
        {flags.recurringFailures.length > 0 && (
          <View style={[styles.glassCard, styles.warningCard]}>
            <Text style={styles.warningTitle}>Recurring Failures</Text>
            <Text style={styles.warningSubtitle}>These faults appeared across multiple MOTs — a sign of a chronic problem.</Text>
            {flags.recurringFailures.map((f, i) => (
              <View key={i} style={styles.flagRow}>
                <View style={{ flex: 1, flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                  {f.dangerous && <View style={styles.dangerDot} />}
                  <Text style={styles.flagDesc}>{cleanText(f.description)}</Text>
                </View>
                <Text style={styles.flagCount}>{f.occurrences}x</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Persistent advisories ── */}
        {flags.persistentAdvisories.length > 0 && (
          <View style={[styles.glassCard, { borderLeftWidth: 3, borderLeftColor: C.warning }]}>
            <Text style={[styles.warningTitle, { color: C.warning }]}>Ignored Advisories</Text>
            <Text style={styles.warningSubtitle}>The previous owner was advised about these and did nothing.</Text>
            {flags.persistentAdvisories.map((f, i) => (
              <View key={i} style={styles.flagRow}>
                <Text style={[styles.flagDesc, { flex: 1 }]}>{cleanText(f.description)}</Text>
                <Text style={styles.flagCount}>{f.occurrences}x</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Diagnose a symptom ── */}
        <TouchableOpacity
          style={styles.diagnoseBtn}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: "/diagnose",
              params: {
                make:  data.vehicle.make,
                model: data.vehicle.model,
                year:  String(data.vehicle.year),
              },
            })
          }
        >
          <View style={styles.diagnoseBtnInner}>
            <Text style={styles.diagnoseBtnIcon}>🔧</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.diagnoseBtnTitle}>Diagnose a symptom</Text>
              <Text style={styles.diagnoseBtnDesc}>
                Noticed something on a test drive? Match it against known faults for this {data.vehicle.make}.
              </Text>
            </View>
            <Text style={styles.diagnoseBtnChevron}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ── HPI Banner ── */}
        <View style={[styles.glassCard, { borderLeftWidth: 3, borderLeftColor: "#3b82f6" }]}>
          <Text style={[styles.cardLabel, { color: "#3b82f6" }]}>Run an HPI Check Before You Buy</Text>
          <Text style={styles.hpiBody}>
            Augur checks MOT history and reliability. It can't verify write-offs, outstanding finance, or theft. An HPI check covers all three.
          </Text>
        </View>

      </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 16, paddingBottom: 48 },
  centered:  { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg, paddingHorizontal: 40 },
  errorText: { color: C.danger, fontSize: 16 },

  // ── Loading screen ───────────────────────────────────────────────────────────
  loadingReg: {
    fontSize: 28,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: 3,
    marginBottom: 36,
    textTransform: "uppercase",
  },
  loadingSteps: { gap: 20, width: "100%" },
  loadingStepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  loadingDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.textDim,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingDotDone:   { backgroundColor: C.accent, borderColor: C.accent },
  loadingDotActive: { backgroundColor: C.accent, borderColor: C.accent },
  loadingCheck:     { fontSize: 13, fontWeight: "900", color: C.bg },
  loadingStepText:  { fontSize: 15, color: C.textDim },
  loadingStepDone:  { color: C.textMuted },
  loadingStepActive:{ color: C.textPrimary, fontWeight: "600" },

  // ── Vehicle header ───────────────────────────────────────────────────────────
  vehicleHeader: {
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 12,
  },
  vehicleReg: { color: C.textDim },

  // ── Glass card ───────────────────────────────────────────────────────────────
  glassCard: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // ── Score ────────────────────────────────────────────────────────────────────
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  scoreCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  scoreNumber:   { fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 36 },
  scoreMax:      { fontSize: 11, fontWeight: "600", opacity: 0.6 },
  scoreInfo:     { flex: 1 },
  verdictLabel:  { fontSize: 28, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  scoreSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 6 },
  breakdownRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  breakdownItem: { fontSize: 11, color: C.danger, backgroundColor: "rgba(224,85,48,0.12)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  // ── Stat cards ───────────────────────────────────────────────────────────────
  statRow:  { flexDirection: "row", gap: 12, marginBottom: 0 },
  statCard: { flex: 1, marginBottom: 12 },
  statLabel: { fontSize: 11, color: C.textMuted, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: "700", color: C.textPrimary },
  statUnit:  { fontSize: 13, color: C.textMuted, fontWeight: "400" },

  // ── Summary ──────────────────────────────────────────────────────────────────
  summaryText: { fontSize: 15, color: C.textPrimary, lineHeight: 23 },

  // ── Danger card ──────────────────────────────────────────────────────────────
  dangerCard:     { borderLeftWidth: 3, borderLeftColor: C.danger },
  dangerTitle:    { fontSize: 13, fontWeight: "700", color: C.danger, marginBottom: 4 },
  dangerBody:     { fontSize: 14, color: C.textPrimary, lineHeight: 21 },
  dangerSubtitle: { fontSize: 12, color: "#ffffff", marginBottom: 10, lineHeight: 18 },

  // ── Recalls ──────────────────────────────────────────────────────────────────
  recallItem: {
    borderTopWidth: 1,
    borderTopColor: "rgba(224,85,48,0.2)",
    paddingTop: 10,
    marginTop: 10,
    gap: 3,
  },
  recallConcern: { fontSize: 13, fontWeight: "600", color: C.textPrimary },
  recallDefect:  { fontSize: 13, color: "#ffffff", lineHeight: 18 },
  recallMeta:    { fontSize: 11, color: "rgba(255,255,255,0.5)" },

  // ── Warning card (recurring) ─────────────────────────────────────────────────
  warningCard:    { borderLeftWidth: 3, borderLeftColor: C.danger },
  warningTitle:   { fontSize: 13, fontWeight: "700", color: C.danger, marginBottom: 2 },
  warningSubtitle:{ fontSize: 12, color: "#ffffff", marginBottom: 10 },
  flagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  flagDesc:  { fontSize: 13, color: C.textPrimary, lineHeight: 19 },
  flagCount: { fontSize: 12, color: C.textMuted, fontWeight: "600", minWidth: 24, textAlign: "right" },
  dangerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.danger, marginTop: 5 },

  // ── Diagnose button ───────────────────────────────────────────────────────────
  diagnoseBtn: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  diagnoseBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  diagnoseBtnIcon:    { fontSize: 26 },
  diagnoseBtnTitle:   { fontSize: 15, fontWeight: "700", color: C.textPrimary, marginBottom: 3 },
  diagnoseBtnDesc:    { fontSize: 13, color: C.textMuted, lineHeight: 18 },
  diagnoseBtnChevron: { fontSize: 22, color: C.textMuted },

  // ── HPI ──────────────────────────────────────────────────────────────────────
  hpiBody: { fontSize: 13, color: "#ffffff", lineHeight: 20 },

  // ── Limited data banner ───────────────────────────────────────────────────────
  limitedDataBanner: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderLeftWidth: 3,
    borderLeftColor: C.textMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 4,
  },
  limitedDataTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  limitedDataBody: {
    fontSize: 13,
    color: C.textMuted,
    lineHeight: 19,
  },

  // ── Expand toggle buttons ────────────────────────────────────────────────────
  expandButtonRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  expandToggleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.glassBorder,
    backgroundColor: C.glass,
    alignItems: "center",
  },
  expandToggleBtnActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(194,214,53,0.1)",
  },
  expandToggleText: { fontSize: 13, color: C.textMuted, fontWeight: "600" },
  expandToggleTextActive: { color: C.accent },

  // ── Expand inline button ─────────────────────────────────────────────────────
  expandBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  expandBtnText: { fontSize: 13, color: C.textMuted },

  // ── MOT history ──────────────────────────────────────────────────────────────
  motRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  motRowFraud: { backgroundColor: "rgba(224,85,48,0.08)", borderRadius: 6, paddingHorizontal: 6 },
  motDate:     { fontSize: 14, fontWeight: "600", color: C.textPrimary },
  motMileage:  { fontSize: 12, color: C.textMuted },
  motBadge:    { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  motBadgeText:{ color: C.bg, fontSize: 12, fontWeight: "700" },
  motCounts:   { fontSize: 12, color: C.textMuted },

  // ── Fault rows ───────────────────────────────────────────────────────────────
  faultRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  faultHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  faultCategory: { fontSize: 12, color: C.textMuted, fontWeight: "600" },
  faultBadges:   { flexDirection: "row", gap: 6 },
  badge:         { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText:     { fontSize: 10, fontWeight: "700", color: C.bg },
  faultDesc:     { fontSize: 14, color: C.textPrimary, lineHeight: 20 },
  faultSource:   { fontSize: 11, color: C.textDim, marginTop: 4 },
});
