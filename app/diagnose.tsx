import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

const DIAGNOSE_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/vehicle-diagnose";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  surface:     "#131510",
  border:      "#1f2118",
  accent:      "#c2d635",
  danger:      "#e05530",
  warning:     "#e8a020",
  textPrimary: "#ffffff",
  textMuted:   "#888",
  textDim:     "#555",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Diagnosis = {
  fault:       string;
  confidence:  number;
  category:    string;
  provenance:  string;
  source:      string;
};

type DiagnoseResult = {
  make:               string;
  model:              string;
  year:               number;
  symptom:            string;
  vehicle_system:     string;
  system_confidence:  "high" | "medium" | "low";
  diagnoses:          Diagnosis[];
  fallback_guidance:  string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROVENANCE_COLOR: Record<string, string> = {
  "DVSA Recall":    C.danger,
  "Honest John":    "#8b5cf6",
  "Augur Research": "#3b82f6",
  "DVSA MOT":       C.accent,
};

function confidenceColor(pct: number): string {
  if (pct >= 70) return C.danger;
  if (pct >= 40) return C.warning;
  return C.textMuted;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiagnoseScreen() {
  // Optional params when navigating from results.tsx
  const params = useLocalSearchParams<{ make?: string; model?: string; year?: string }>();

  const [make,    setMake]    = useState(params.make    ?? "");
  const [model,   setModel]   = useState(params.model   ?? "");
  const [year,    setYear]    = useState(params.year    ?? "");
  const [symptom, setSymptom] = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<DiagnoseResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const hasVehicle = !!(params.make && params.model && params.year);
  const canSubmit  = make.trim() && model.trim() && year.trim() && symptom.trim().length >= 5;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `${DIAGNOSE_URL}?make=${encodeURIComponent(make.trim())}&model=${encodeURIComponent(model.trim())}&year=${year.trim()}&symptom=${encodeURIComponent(symptom.trim())}`,
        { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Caveat ── */}
        <View style={styles.caveat}>
          <Text style={styles.caveatText}>
            This is not a mechanic's diagnosis. Have the car inspected by a professional before buying.
          </Text>
        </View>

        {/* ── Vehicle fields (only if not pre-filled) ── */}
        {hasVehicle ? (
          <View style={styles.vehicleChip}>
            <Text style={styles.vehicleChipLabel}>Diagnosing</Text>
            <Text style={styles.vehicleChipValue}>
              {params.year} {params.make} {params.model}
            </Text>
          </View>
        ) : (
          <View style={styles.glassCard}>
            <Text style={styles.cardLabel}>Vehicle</Text>
            <View style={styles.vehicleRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                value={make}
                onChangeText={setMake}
                placeholder="Make"
                placeholderTextColor={C.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.input, { flex: 2 }]}
                value={model}
                onChangeText={setModel}
                placeholder="Model"
                placeholderTextColor={C.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={year}
                onChangeText={setYear}
                placeholder="Year"
                placeholderTextColor={C.textMuted}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>
        )}

        {/* ── Symptom input ── */}
        <View style={styles.glassCard}>
          <Text style={styles.cardLabel}>Describe what you noticed</Text>
          <TextInput
            style={styles.symptomInput}
            value={symptom}
            onChangeText={setSymptom}
            placeholder="e.g. grinding noise when braking at low speed, pulls to the left"
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCorrect={false}
          />
          <Text style={styles.symptomHint}>
            Be specific — mention when it happens, how often, and under what conditions.
          </Text>
        </View>

        {/* ── Submit ── */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#080a07" />
          ) : (
            <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
              Run diagnosis
            </Text>
          )}
        </TouchableOpacity>

        {/* ── Error ── */}
        {error && (
          <Text style={styles.errorText}>Failed: {error}</Text>
        )}

        {/* ── Results ── */}
        {result && (
          <View style={styles.results}>

            {/* ── System classification badge ── */}
            {result.vehicle_system && result.vehicle_system !== "Unknown" && (
              <View style={styles.systemRow}>
                <Text style={styles.systemLabel}>Classified as</Text>
                <View style={[
                  styles.systemBadge,
                  result.system_confidence === "low" && styles.systemBadgeLow,
                ]}>
                  <Text style={styles.systemBadgeText}>{result.vehicle_system}</Text>
                </View>
                {result.system_confidence === "low" && (
                  <Text style={styles.systemUncertain}>· uncertain</Text>
                )}
              </View>
            )}

            <Text style={styles.resultsHeader}>
              {result.diagnoses.length > 0
                ? `${result.diagnoses.length} possible cause${result.diagnoses.length > 1 ? "s" : ""} found`
                : "No matching faults found"}
            </Text>

            {result.diagnoses.length === 0 && (
              result.fallback_guidance ? (
                <View style={styles.guidanceCard}>
                  <View style={styles.guidanceHeader}>
                    <Text style={styles.guidanceTag}>AI Guidance</Text>
                    <Text style={styles.guidanceDisclaimer}>not from verified records</Text>
                  </View>
                  <Text style={styles.guidanceBody}>{result.fallback_guidance}</Text>
                  <Text style={styles.guidanceFooter}>
                    No verified fault records exist for this symptom on this vehicle. The above is general advice only — not a diagnosis.
                  </Text>
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  No verified fault records found. Try rephrasing or check a more common vehicle.
                </Text>
              )
            )}

            {result.diagnoses.map((d, i) => {
              const cColor = confidenceColor(d.confidence);
              const pColor = PROVENANCE_COLOR[d.provenance] ?? C.textDim;
              return (
                <View key={i} style={styles.diagCard}>
                  {/* Confidence */}
                  <View style={styles.diagHeader}>
                    <View style={[styles.confidencePill, { borderColor: cColor }]}>
                      <Text style={[styles.confidenceNum, { color: cColor }]}>{d.confidence}%</Text>
                      <Text style={[styles.confidenceLabel, { color: cColor }]}>likely</Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.diagCategory}>{d.category}</Text>
                      <View style={[styles.provenanceBadge, { backgroundColor: pColor }]}>
                        <Text style={styles.provenanceText}>{d.provenance}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Fault description */}
                  <Text style={styles.diagFault}>{d.fault}</Text>

                  {/* Source */}
                  {d.source && (
                    <Text style={styles.diagSource}>{d.source}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 16, paddingBottom: 48 },

  // ── Caveat ────────────────────────────────────────────────────────────────────
  caveat: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  caveatText: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },

  // ── Vehicle chip (pre-filled) ─────────────────────────────────────────────────
  vehicleChip: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 2,
  },
  vehicleChipLabel: { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  vehicleChipValue: { fontSize: 16, fontWeight: "700", color: C.textPrimary },

  // ── Glass card ────────────────────────────────────────────────────────────────
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

  // ── Vehicle fields ────────────────────────────────────────────────────────────
  vehicleRow: { flexDirection: "row", gap: 8 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 14,
    color: C.textPrimary,
  },

  // ── Symptom ───────────────────────────────────────────────────────────────────
  symptomInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: C.textPrimary,
    minHeight: 110,
    lineHeight: 22,
    marginBottom: 8,
  },
  symptomHint: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
  },

  // ── Submit ────────────────────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  submitBtnDisabled: {
    backgroundColor: "rgba(194,214,53,0.2)",
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#080a07",
  },
  submitTextDisabled: {
    color: "rgba(194,214,53,0.4)",
  },
  errorText: {
    fontSize: 13,
    color: C.danger,
    textAlign: "center",
    marginBottom: 12,
  },

  // ── Results ───────────────────────────────────────────────────────────────────
  results: { gap: 10 },

  // ── System classification ─────────────────────────────────────────────────────
  systemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  systemLabel: {
    fontSize: 12,
    color: C.textMuted,
  },
  systemBadge: {
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  systemBadgeLow: {
    backgroundColor: "rgba(194,214,53,0.25)",
  },
  systemBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.bg,
  },
  systemUncertain: {
    fontSize: 11,
    color: C.textMuted,
    fontStyle: "italic",
  },

  resultsHeader: {
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: 14,
    color: C.textMuted,
    lineHeight: 21,
  },

  // ── Fallback guidance card ────────────────────────────────────────────────────
  guidanceCard: {
    backgroundColor: "rgba(232,160,32,0.06)",
    borderWidth: 1,
    borderColor: "rgba(232,160,32,0.25)",
    borderLeftWidth: 3,
    borderLeftColor: C.warning,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  guidanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  guidanceTag: {
    fontSize: 11,
    fontWeight: "700",
    color: C.warning,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  guidanceDisclaimer: {
    fontSize: 11,
    color: C.textMuted,
    fontStyle: "italic",
  },
  guidanceBody: {
    fontSize: 14,
    color: C.textPrimary,
    lineHeight: 22,
  },
  guidanceFooter: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 10,
  },

  // ── Diagnosis card ────────────────────────────────────────────────────────────
  diagCard: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  diagHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  confidencePill: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 60,
    flexShrink: 0,
  },
  confidenceNum:   { fontSize: 20, fontWeight: "900", lineHeight: 22 },
  confidenceLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  diagCategory: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  provenanceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  provenanceText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#080a07",
  },
  diagFault:  { fontSize: 14, color: C.textPrimary, lineHeight: 21 },
  diagSource: { fontSize: 11, color: C.textDim },
});
