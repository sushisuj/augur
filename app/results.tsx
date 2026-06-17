import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";

const SUPABASE_FUNCTION_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/vehicle-lookup";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";

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
  recalls: Recall[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/�/g, "'");
}

const SEVERITY_COLOR: Record<string, string> = {
  High: "#e53e3e",
  Medium: "#dd6b20",
  Low: "#38a169",
};

const PROVENANCE_COLOR: Record<string, string> = {
  "DVSA Recall":  "#c53030",
  "Honest John":  "#6b46c1",
  "Augur Research": "#2b6cb0",
  "DVSA MOT":     "#276749",
};

const VERDICT_COLOR: Record<string, string> = {
  Buy: "#38a169",
  Consider: "#dd6b20",
  Avoid: "#e53e3e",
};

function formatMileage(mileage: number | null, unit: string): string {
  if (mileage === null) return "Unknown";
  return `${mileage.toLocaleString()} ${unit === "KM" ? "km" : "mi"}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const { reg, vin } = useLocalSearchParams<{ reg: string; vin: string }>();
  const router = useRouter();
  const [data, setData] = useState<VehicleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motExpanded, setMotExpanded] = useState(false);
  const [knownExpanded, setKnownExpanded] = useState(false);
  const [recallsExpanded, setRecallsExpanded] = useState(false);

  useEffect(() => {
    if (vin) fetchVehicle({ vin });
    else if (reg) fetchVehicle({ reg });
  }, [reg, vin]);

  const fetchVehicle = async (params: { reg?: string; vin?: string }) => {
    setLoading(true);
    setError(null);
    const qs = params.vin ? `vin=${params.vin}` : `reg=${params.reg}`;
    try {
      const res = await fetch(`${SUPABASE_FUNCTION_URL}?${qs}`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
        <Text style={styles.loadingText}>Checking {reg}...</Text>
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

  const flags = data.flags ?? { clockingDetected: false, recurringFailures: [], persistentAdvisories: [], consistencyBonus: 0, cleanStreak: 0 };
  const breakdown = data.breakdown;
  const hasRecurringFailures = flags.recurringFailures.length > 0;
  const hasPersistentAdvisories = flags.persistentAdvisories.length > 0;

  // Detect which MOT rows are part of a fraud pair so we can highlight them
  const clockingRows = new Set<string>();
  if (data.mileage_warning) {
    // Only compare miles-to-miles readings — km entries are almost always MOT
    // tester data entry errors (miles entered as km) and create false positives.
    // Also require a >1,000 mile drop to ignore same-day retests (2-mile differences).
    const sorted = [...data.mot_history]
      .filter((t) => t.mileage !== null && (t.mileage_unit ?? "MI").toUpperCase() === "MI")
      .map((t) => ({ date: t.date, miles: t.mileage! }))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      const drop = sorted[i - 1].miles - sorted[i].miles;
      if (drop > 1000) {
        clockingRows.add(sorted[i - 1].date);
        clockingRows.add(sorted[i].date);
      }
    }
  }

  const PREVIEW_COUNT = 3;

  return (
    <>
    <Stack.Screen
      options={{
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 17, color: "#007AFF" }}>‹ Back</Text>
          </TouchableOpacity>
        ),
      }}
    />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Vehicle header */}
      <View style={styles.vehicleCard}>
        <Text style={styles.reg}>{data.vehicle.reg}</Text>
        <Text style={styles.vehicleName}>
          {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
        </Text>
      </View>

      {/* Augur Score */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Augur Score</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreNumber}>{data.score}</Text>
          <Text style={styles.scoreOutOf}>/100</Text>
          <View style={[styles.verdictBadge, { backgroundColor: VERDICT_COLOR[data.verdict] ?? "#999" }]}>
            <Text style={styles.verdictText}>{data.verdict}</Text>
          </View>
        </View>

        {/* Score breakdown */}
        {breakdown && (
          <View style={styles.breakdownContainer}>
            {breakdown.recurringFailureDeduction > 0 && (
              <Text style={styles.breakdownLine}>
                -{breakdown.recurringFailureDeduction} recurring failures
              </Text>
            )}
            {breakdown.persistentAdvisoryDeduction > 0 && (
              <Text style={styles.breakdownLine}>
                -{breakdown.persistentAdvisoryDeduction} persistent advisories
              </Text>
            )}
            {breakdown.modelReliabilityDeduction > 0 && (
              <Text style={styles.breakdownLine}>
                -{breakdown.modelReliabilityDeduction} model reliability
              </Text>
            )}
            {breakdown.consistencyBonus > 0 && (
              <Text style={[styles.breakdownLine, styles.breakdownBonus]}>
                +{breakdown.consistencyBonus} clean MOT streak ({flags.cleanStreak} in a row)
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Mileage / clocking warning */}
      {data.mileage_warning && (
        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>Odometer Fraud Detected</Text>
          <Text style={styles.dangerText}>{data.mileage_warning}</Text>
        </View>
      )}

      {/* Active recalls */}
      {data.recalls?.length > 0 && (
        <View style={styles.recallCard}>
          <Text style={styles.recallTitle}>
            Active Recall{data.recalls.length > 1 ? "s" : ""} ({data.recalls.length})
          </Text>
          <Text style={styles.recallSubtitle}>
            This vehicle falls within the build date range of a DVSA safety recall. Ask the seller whether this was completed — any main dealer can verify it against the VIN for free.
          </Text>
          {(recallsExpanded ? data.recalls : data.recalls.slice(0, PREVIEW_COUNT)).map((recall, i) => (
            <View key={i} style={styles.recallItem}>
              <Text style={styles.recallConcern}>{recall.concern}</Text>
              <Text style={styles.recallDefect}>{recall.defect}</Text>
              <Text style={styles.recallMeta}>
                Recall {recall.recall_number}
                {recall.build_start ? `  |  Affects builds ${recall.build_start} – ${recall.build_end ?? "onwards"}` : ""}
              </Text>
            </View>
          ))}
          {data.recalls.length > PREVIEW_COUNT && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setRecallsExpanded(!recallsExpanded)}
            >
              <Text style={styles.expandChevron}>{recallsExpanded ? "∧" : "∨"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Recurring failures */}
      {hasRecurringFailures && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Recurring Failures</Text>
          <Text style={styles.warningSubtitle}>
            These faults appeared across multiple MOT tests — a sign of a chronic problem.
          </Text>
          {flags.recurringFailures.map((f, i) => (
            <View key={i} style={styles.flagRow}>
              <View style={styles.flagRowLeft}>
                {f.dangerous && <View style={styles.dangerDot} />}
                <Text style={styles.flagDescription}>{cleanText(f.description)}</Text>
              </View>
              <Text style={styles.flagMeta}>{f.occurrences}x</Text>
            </View>
          ))}
        </View>
      )}

      {/* Persistent advisories */}
      {hasPersistentAdvisories && (
        <View style={styles.cautionCard}>
          <Text style={styles.cautionTitle}>Ignored Advisories</Text>
          <Text style={styles.cautionSubtitle}>
            These advisories appeared in more than one MOT without being fixed. The previous owner was aware and did nothing.
          </Text>
          {flags.persistentAdvisories.map((f, i) => (
            <View key={i} style={styles.flagRow}>
              <Text style={styles.flagDescription}>{cleanText(f.description)}</Text>
              <Text style={styles.flagMeta}>{f.occurrences}x</Text>
            </View>
          ))}
        </View>
      )}

      {/* AI Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buyer Summary</Text>
        <Text style={styles.summary}>{cleanText(data.summary)}</Text>
      </View>

      {/* HPI recommendation banner */}
      <View style={styles.hpiBanner}>
        <Text style={styles.hpiTitle}>Run an HPI Check Before You Buy</Text>
        <Text style={styles.hpiText}>
          Augur checks MOT history and reliability data. It can't verify write-offs, outstanding finance, or whether the car has been stolen. An HPI check covers all three.
        </Text>
      </View>

      {/* MOT History */}
      {data.mot_history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MOT History ({data.mot_history.length})</Text>
          {(motExpanded ? data.mot_history : data.mot_history.slice(0, PREVIEW_COUNT)).map((test, i) => {
            const isFraud = clockingRows.has(test.date);
            return (
              <View
                key={i}
                style={[
                  styles.motRow,
                  isFraud && styles.motRowFraud,
                ]}
              >
                <View style={styles.motLeft}>
                  <Text style={[styles.motDate, isFraud && styles.motDateFraud]}>{test.date}</Text>
                  <Text style={[styles.motMileage, isFraud && styles.motMileageFraud]}>
                    {formatMileage(test.mileage, test.mileage_unit)}
                  </Text>
                </View>
                <View style={styles.motRight}>
                  <View style={[
                    styles.motResultBadge,
                    { backgroundColor: test.result === "PASSED" ? "#38a169" : "#e53e3e" }
                  ]}>
                    <Text style={styles.motResultText}>
                      {test.result === "PASSED" ? "Pass" : "Fail"}
                    </Text>
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
          {data.mot_history.length > PREVIEW_COUNT && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setMotExpanded(!motExpanded)}
            >
              <Text style={styles.expandChevron}>{motExpanded ? "∧" : "∨"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Vehicle-specific issues */}
      {data.vehicle_issues.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Vehicle's Issues</Text>
          <Text style={styles.provenanceNote}>From this car's actual MOT test history</Text>
          {data.vehicle_issues.map((fault, i) => (
            <View key={i} style={styles.faultCard}>
              <View style={styles.faultHeader}>
                <Text style={styles.faultCategory}>{fault.fault_category}</Text>
                <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLOR[fault.severity] ?? "#999" }]}>
                  <Text style={styles.severityText}>{fault.severity}</Text>
                </View>
              </View>
              <Text style={styles.faultDescription}>{cleanText(fault.fault_description)}</Text>
              <Text style={styles.faultSource}>{fault.source}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Model-wide faults */}
      {data.model_faults.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Known Issues ({data.model_faults.length})
          </Text>
          <Text style={styles.provenanceNote}>
            Common faults and recalls for {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
          </Text>
          {(knownExpanded ? data.model_faults : data.model_faults.slice(0, PREVIEW_COUNT)).map((fault, i) => (
            <View key={i} style={styles.faultCard}>
              <View style={styles.faultHeader}>
                <Text style={styles.faultCategory}>{fault.fault_category}</Text>
                <View style={styles.faultBadgeRow}>
                  {fault.provenance && (
                    <View style={[styles.provenanceBadge, PROVENANCE_COLOR[fault.provenance] && { backgroundColor: PROVENANCE_COLOR[fault.provenance] }]}>
                      <Text style={styles.provenanceText}>{fault.provenance}</Text>
                    </View>
                  )}
                  <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLOR[fault.severity] ?? "#999" }]}>
                    <Text style={styles.severityText}>{fault.severity}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.faultDescription}>{cleanText(fault.fault_description)}</Text>
            </View>
          ))}
          {data.model_faults.length > PREVIEW_COUNT && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setKnownExpanded(!knownExpanded)}
            >
              <Text style={styles.expandChevron}>{knownExpanded ? "∧" : "∨"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

    </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#666", fontSize: 16 },
  errorText: { color: "#e53e3e", fontSize: 16 },

  vehicleCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  reg: { color: "#f7d94c", fontSize: 28, fontWeight: "bold", letterSpacing: 4 },
  vehicleName: { color: "#fff", fontSize: 18, marginTop: 4 },

  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  provenanceNote: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
    fontStyle: "italic",
  },

  // Score
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  scoreNumber: { fontSize: 48, fontWeight: "bold", color: "#1a1a1a" },
  scoreOutOf: { fontSize: 20, color: "#999", marginRight: 12 },
  verdictBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  verdictText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Score breakdown
  breakdownContainer: { marginTop: 12, gap: 3 },
  breakdownLine: { fontSize: 12, color: "#e53e3e" },
  breakdownBonus: { color: "#38a169" },

  // Danger card (clocking)
  dangerCard: {
    backgroundColor: "#fff5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#e53e3e",
  },
  dangerTitle: { fontSize: 14, fontWeight: "700", color: "#c53030", marginBottom: 4 },
  dangerText: { fontSize: 14, color: "#c53030" },

  // Warning card (recurring failures)
  warningCard: {
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  warningTitle: { fontSize: 14, fontWeight: "700", color: "#92400e", marginBottom: 2 },
  warningSubtitle: { fontSize: 12, color: "#b45309", marginBottom: 10 },

  // Caution card (persistent advisories)
  cautionCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#dd6b20",
  },
  cautionTitle: { fontSize: 14, fontWeight: "700", color: "#c05621", marginBottom: 2 },
  cautionSubtitle: { fontSize: 12, color: "#c05621", marginBottom: 10 },

  // Flag rows (inside warning/caution cards)
  flagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#fde68a",
    gap: 8,
  },
  flagRowLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  dangerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#e53e3e", marginTop: 4 },
  flagDescription: { flex: 1, fontSize: 13, color: "#444" },
  flagMeta: { fontSize: 12, color: "#999", fontWeight: "600", minWidth: 24, textAlign: "right" },

  // HPI Banner
  hpiBanner: {
    backgroundColor: "#f0f4ff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#4c6ef5",
  },
  hpiTitle: { fontSize: 14, fontWeight: "700", color: "#3451c7", marginBottom: 4 },
  hpiText: { fontSize: 13, color: "#3451c7", lineHeight: 19 },

  summary: { fontSize: 16, color: "#1a1a1a", lineHeight: 24 },

  // MOT History
  motRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  motLeft: { gap: 2 },
  motDate: { fontSize: 14, fontWeight: "600", color: "#1a1a1a" },
  motMileage: { fontSize: 12, color: "#999" },
  motRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  motResultBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  motResultText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  motCounts: { fontSize: 12, color: "#999" },

  // Faults
  faultCard: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
    marginTop: 12,
  },
  faultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  faultCategory: { fontSize: 13, fontWeight: "600", color: "#444" },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  severityText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  faultDescription: { fontSize: 14, color: "#555", lineHeight: 20 },
  faultSource: { fontSize: 11, color: "#aaa", marginTop: 4 },
  faultBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  provenanceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#718096",
  },
  provenanceText: { color: "#fff", fontSize: 10, fontWeight: "600" },

  // Fraud-highlighted MOT rows
  motRowFraud: {
    backgroundColor: "#fff5f5",
    borderRadius: 6,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderTopColor: "#fed7d7",
  },
  motDateFraud: { color: "#c53030" },
  motMileageFraud: { color: "#e53e3e", fontWeight: "600" },

  // Recall card
  recallCard: {
    backgroundColor: "#fff5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#c53030",
  },
  recallTitle: { fontSize: 14, fontWeight: "700", color: "#c53030", marginBottom: 4 },
  recallSubtitle: { fontSize: 12, color: "#c53030", marginBottom: 12, lineHeight: 18 },
  recallItem: {
    borderTopWidth: 1,
    borderTopColor: "#fed7d7",
    paddingTop: 10,
    marginTop: 10,
    gap: 4,
  },
  recallConcern: { fontSize: 13, fontWeight: "600", color: "#742a2a" },
  recallDefect: { fontSize: 13, color: "#c53030", lineHeight: 18 },
  recallMeta: { fontSize: 11, color: "#e53e3e", marginTop: 2 },

  // Expand/collapse button
  expandButton: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  expandChevron: { fontSize: 16, color: "#999", lineHeight: 18 },
});
