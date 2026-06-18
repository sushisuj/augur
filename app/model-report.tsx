import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

const MODEL_SUMMARY_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/model-summary";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";

const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  accent:      "#c2d635",
  warning:     "#e8a020",
  danger:      "#e05530",
  textPrimary: "#ffffff",
  textMuted:   "#888",
  textBody:    "rgba(255,255,255,0.75)" as const,
};

const PROVENANCE_COLOR: Record<string, string> = {
  "DVSA Recall":    C.danger,
  "Honest John":    "#8b5cf6",
  "Augur Research": "#3b82f6",
  "DVSA MOT":       C.accent,
};

type ModelReport = {
  make: string;
  model: string;
  year_from: number;
  year_to: number;
  summary: string;
  records_used: number;
  pass_rate: number | null;
  total_tests: number;
  verdict: string;
  sources: { mot_failures: number; known_faults: number; recalls: number };
  mot_failures: { reason: string; frequency: number }[];
  known_faults: { description: string; category: string; provenance: string }[];
  recalls: { defect: string }[];
};

function verdictColor(verdict: string): string {
  if (verdict === "Great")         return C.accent;
  if (verdict === "Good")          return "#4ade80";
  if (verdict === "Average")       return C.warning;
  if (verdict === "Below average") return C.danger;
  return C.textMuted;
}

export default function ModelReportScreen() {
  const { make, model, year } = useLocalSearchParams<{ make: string; model: string; year: string }>();
  const router = useRouter();

  const [data,    setData]    = useState<ModelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!make || !model || !year) return;
    const yearNum = parseInt(year);
    // Use ±2 year window around the stated year
    const qs = new URLSearchParams({
      make,
      model,
      year_from: String(Math.max(yearNum - 2, yearNum - 2)),
      year_to:   String(yearNum + 2),
    });
    fetch(`${MODEL_SUMMARY_URL}?${qs}`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json))
      .catch((e) => setError(e.message ?? "Something went wrong"))
      .finally(() => setLoading(false));
  }, [make, model, year]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>Checking {make} {model} {year}…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn't load report</Text>
        <Text style={styles.errorBody}>{error ?? "No data returned"}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.make}>{data.make.toUpperCase()}</Text>
        <Text style={styles.model}>{data.model}</Text>
        <Text style={styles.year}>{year} · Model report</Text>
      </View>

      {/* ── Model report banner ── */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          This is a model-level report based on population data — not a check on a specific vehicle. To check a specific car, enter its registration plate.
        </Text>
      </View>

      {/* ── Pass rate + verdict ── */}
      {data.pass_rate !== null && (
        <View style={styles.card}>
          <View style={styles.passRateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>MOT PASS RATE</Text>
              <Text style={[styles.passRatePercent, { color: verdictColor(data.verdict) }]}>
                {(data.pass_rate * 100).toFixed(1)}%
              </Text>
              {data.total_tests > 0 && (
                <Text style={styles.passRateTests}>
                  Based on {data.total_tests.toLocaleString()} MOT tests
                </Text>
              )}
            </View>
            <View style={[styles.verdictBadge, { borderColor: verdictColor(data.verdict) }]}>
              <Text style={[styles.verdictText, { color: verdictColor(data.verdict) }]}>
                {data.verdict}
              </Text>
            </View>
          </View>
          <Text style={styles.passRateNote}>
            This reflects how often this model passes its MOT across the UK population — not a prediction for a specific car.
          </Text>
        </View>
      )}

      {/* ── AI Summary ── */}
      {data.summary ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>AUGUR SUMMARY</Text>
          <Text style={styles.summaryText}>{data.summary}</Text>
          {data.records_used > 0 && (
            <Text style={styles.attribution}>
              Based on {data.records_used} verified record{data.records_used !== 1 ? "s" : ""} · AI summary
            </Text>
          )}
        </View>
      ) : null}

      {/* ── Common MOT failures ── */}
      {data.mot_failures.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>COMMON MOT FAILURES</Text>
          <Text style={styles.cardSubtitle}>Most frequent reasons this model fails its MOT</Text>
          {data.mot_failures.map((f, i) => (
            <View key={i} style={styles.listRow}>
              <View style={styles.listRowLeft}>
                <Text style={styles.listRowIndex}>{i + 1}</Text>
                <Text style={styles.listRowText}>{f.reason}</Text>
              </View>
              <View style={styles.freqBadge}>
                <Text style={styles.freqBadgeText}>{f.frequency.toLocaleString()}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.dataSource}>Source: DVSA MOT Bulk Dataset</Text>
        </View>
      )}

      {/* ── Known faults ── */}
      {data.known_faults.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>KNOWN FAULTS</Text>
          <Text style={styles.cardSubtitle}>Verified issues from curated sources</Text>
          {data.known_faults.map((f, i) => {
            const provColor = PROVENANCE_COLOR[f.provenance] ?? C.textMuted;
            return (
              <View key={i} style={styles.faultRow}>
                <Text style={styles.faultDesc}>{f.description}</Text>
                <View style={[styles.provBadge, { borderColor: provColor }]}>
                  <Text style={[styles.provText, { color: provColor }]}>{f.provenance}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Recalls ── */}
      {data.recalls.length > 0 && (
        <View style={[styles.card, styles.cardDanger]}>
          <Text style={[styles.cardLabel, { color: C.danger }]}>
            ACTIVE RECALLS · {data.recalls.length}
          </Text>
          <Text style={styles.cardSubtitle}>Safety recalls issued by the manufacturer</Text>
          {data.recalls.map((r, i) => (
            <View key={i} style={styles.recallRow}>
              <Text style={styles.recallBullet}>!</Text>
              <Text style={styles.recallText}>{r.defect}</Text>
            </View>
          ))}
          <Text style={styles.dataSource}>Source: DVSA Vehicle Recall Register</Text>
        </View>
      )}

      {/* ── No data state ── */}
      {data.records_used === 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>LIMITED DATA</Text>
          <Text style={styles.listRowText}>
            Augur doesn't have enough records for the {make} {model} to produce a meaningful report. Try checking a specific vehicle by registration plate instead.
          </Text>
        </View>
      )}

      {/* ── CTA ── */}
      <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push("/home")} activeOpacity={0.85}>
        <Text style={styles.ctaBtnText}>Check a specific {data.make} {data.model}</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 24, paddingBottom: 48 },

  centered: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  loadingText:  { fontSize: 14, color: C.textMuted, marginTop: 12 },
  errorTitle:   { fontSize: 18, fontWeight: "700", color: C.textPrimary },
  errorBody:    { fontSize: 14, color: C.textMuted, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: { fontSize: 14, color: C.textMuted },

  // Header
  header:     { marginBottom: 20, marginTop: 8 },
  make:       { fontSize: 11, fontWeight: "600", color: C.textMuted, letterSpacing: 1, marginBottom: 2 },
  model:      { fontSize: 32, fontWeight: "800", color: C.textPrimary, marginBottom: 4 },
  year:       { fontSize: 13, color: C.textMuted },

  // Info banner
  infoBanner: {
    backgroundColor: "rgba(232,160,32,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,160,32,0.3)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: 13,
    color: C.warning,
    lineHeight: 19,
  },

  // Cards
  card: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    gap: 10,
  },
  cardDanger: {
    borderColor: "rgba(224,85,48,0.3)",
    backgroundColor: "rgba(224,85,48,0.08)",
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: C.accent,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cardSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: -4,
  },

  // Summary
  summaryText: {
    fontSize: 14,
    color: C.textBody,
    lineHeight: 22,
  },
  attribution: {
    fontSize: 11,
    color: C.textMuted,
    fontStyle: "italic",
  },

  // MOT list
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  listRowLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  listRowIndex: { fontSize: 12, fontWeight: "700", color: C.textMuted, width: 18 },
  listRowText: { fontSize: 14, color: C.textBody, lineHeight: 20, flex: 1 },
  freqBadge: {
    backgroundColor: "rgba(194,214,53,0.1)",
    borderWidth: 1,
    borderColor: "rgba(194,214,53,0.2)",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  freqBadgeText: { fontSize: 11, fontWeight: "700", color: C.accent },

  // Faults
  faultRow: { gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  faultDesc: { fontSize: 14, color: C.textBody, lineHeight: 20 },
  provBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  provText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  // Recalls
  recallRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(224,85,48,0.1)", alignItems: "flex-start" },
  recallBullet: { fontSize: 13, fontWeight: "800", color: C.danger, width: 16 },
  recallText: { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20, flex: 1 },

  dataSource: { fontSize: 11, color: C.textMuted, fontStyle: "italic", marginTop: 4 },

  // Pass rate
  passRateRow:     { flexDirection: "row", alignItems: "center", gap: 12 },
  passRatePercent: { fontSize: 42, fontWeight: "800", lineHeight: 48 },
  passRateTests:   { fontSize: 12, color: C.textMuted, marginTop: 2 },
  passRateNote:    { fontSize: 12, color: C.textMuted, lineHeight: 18, marginTop: 4 },
  verdictBadge: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  verdictText: { fontSize: 14, fontWeight: "800" },

  // CTA
  ctaBtn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  ctaBtnText: { fontSize: 15, fontWeight: "700", color: C.bg },
});
