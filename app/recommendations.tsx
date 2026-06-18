import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";
const MODEL_SUMMARY_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/model-summary";

const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  accent:      "#c2d635",
  textPrimary: "#ffffff",
  textMuted:   "#888",
  tagBg:       "rgba(194,214,53,0.12)" as const,
};

// ── Data ──────────────────────────────────────────────────────────────────────

type CarRecommendation = {
  id: string;
  make: string;
  model: string;
  yearRange: string;
  yearFrom: number;
  yearTo: number;
  tags: string[];
  bodyTypes: string[];
};

async function fetchModelSummary(car: CarRecommendation): Promise<{ summary: string; recordsUsed: number } | null> {
  const cacheKey = `augur_model_summary_${car.id}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore cache errors */ }

  try {
    const qs = new URLSearchParams({
      make:      car.make,
      model:     car.model,
      year_from: String(car.yearFrom),
      year_to:   String(car.yearTo),
    });

    const res = await fetch(
      `${MODEL_SUMMARY_URL}?${qs}`,
      { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );

    const text = await res.text();
    console.log(`[model-summary] ${car.make} ${car.model} → HTTP ${res.status}:`, text);

    if (!res.ok) return null;

    const data = JSON.parse(text);
    if (!data.summary) return null;

    const result = { summary: data.summary, recordsUsed: data.records_used ?? 0 };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (err) {
    console.log(`[model-summary] fetch error for ${car.make} ${car.model}:`, err);
    return null;
  }
}

const ALL_PICKS: CarRecommendation[] = [
  {
    id: "golf-mk7",
    make: "Volkswagen", model: "Golf",
    yearRange: "2013 – 2020", yearFrom: 2013, yearTo: 2020,
    tags: ["Hatchback", "Manual / Auto", "Wide availability", "Watch: DSG service history"],
    bodyTypes: ["hatchback"],
  },
  {
    id: "3series-f30",
    make: "BMW", model: "3 Series",
    yearRange: "2012 – 2019", yearFrom: 2012, yearTo: 2019,
    tags: ["Saloon", "Rear-wheel drive", "Strong parts support", "Watch: timing chain"],
    bodyTypes: ["saloon"],
  },
  {
    id: "octavia-estate",
    make: "Skoda", model: "Octavia",
    yearRange: "2013 – 2020", yearFrom: 2013, yearTo: 2020,
    tags: ["Estate", "Exceptional practicality", "VW Group platform", "Watch: DPF on short runs"],
    bodyTypes: ["estate"],
  },
  {
    id: "rav4-mk4",
    make: "Toyota", model: "RAV4",
    yearRange: "2013 – 2018", yearFrom: 2013, yearTo: 2018,
    tags: ["SUV", "Hybrid available", "Exceptional reliability", "Watch: rust on older examples"],
    bodyTypes: ["suv"],
  },
  {
    id: "4series-f32",
    make: "BMW", model: "4 Series",
    yearRange: "2013 – 2020", yearFrom: 2013, yearTo: 2020,
    tags: ["Coupé", "Rear-wheel drive", "Strong depreciation benefit", "Watch: timing chain"],
    bodyTypes: ["coupe"],
  },
  {
    id: "mx5-nd",
    make: "Mazda", model: "MX-5",
    yearRange: "2015 – 2024", yearFrom: 2015, yearTo: 2024,
    tags: ["Convertible", "Driver's car", "Reliable hood mechanism", "Watch: sill rust"],
    bodyTypes: ["convertible"],
  },
  {
    id: "ranger-mk4",
    make: "Ford", model: "Ranger",
    yearRange: "2012 – 2022", yearFrom: 2012, yearTo: 2022,
    tags: ["Pickup", "Double cab", "Strong towing capacity", "Watch: injector wear on high mileage"],
    bodyTypes: ["pickup"],
  },
];

// ── Proximity map ─────────────────────────────────────────────────────────────
// Ordered from closest match to furthest for each body type.
// Position in array = proximity rank (lower = closer).

const BODY_TYPE_PROXIMITY: Record<string, string[]> = {
  hatchback:   ["saloon", "estate", "coupe", "suv", "convertible", "pickup"],
  saloon:      ["hatchback", "estate", "coupe", "suv", "convertible", "pickup"],
  estate:      ["saloon", "suv", "hatchback", "pickup", "coupe", "convertible"],
  suv:         ["estate", "pickup", "hatchback", "saloon", "coupe", "convertible"],
  coupe:       ["hatchback", "saloon", "convertible", "estate", "suv", "pickup"],
  convertible: ["coupe", "hatchback", "saloon", "estate", "suv", "pickup"],
  pickup:      ["suv", "estate", "saloon", "hatchback", "coupe", "convertible"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickRecommendations(persona: Record<string, any> | null): {
  primary: CarRecommendation;
  others: CarRecommendation[];
} {
  const bodyTypes: string[] = persona?.body_type ?? [];

  // Primary: first car matching the user's first body type selection
  let primaryBodyType = "hatchback";
  let primary: CarRecommendation | undefined;
  for (const bt of bodyTypes) {
    primary = ALL_PICKS.find((p) => p.bodyTypes.includes(bt));
    if (primary) { primaryBodyType = bt; break; }
  }
  if (!primary) primary = ALL_PICKS[0];

  // Others: sorted by proximity to the primary body type
  const proximityOrder = BODY_TYPE_PROXIMITY[primaryBodyType] ?? [];

  const others = ALL_PICKS
    .filter((p) => p.id !== primary!.id)
    .sort((a, b) => {
      const rankA = proximityOrder.findIndex((bt) => a.bodyTypes.includes(bt));
      const rankB = proximityOrder.findIndex((bt) => b.bodyTypes.includes(bt));
      // -1 means not found; push to end
      return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
    });

  return { primary, others };
}

// ── Components ────────────────────────────────────────────────────────────────

function CarCard({
  car,
  isTop,
  summary,
  recordsUsed,
  timedOut,
  onCheck,
}: {
  car: CarRecommendation;
  isTop: boolean;
  summary: string | null | undefined; // undefined = loading, null = failed, string = done
  recordsUsed: number;
  timedOut: boolean;
  onCheck: () => void;
}) {
  return (
    <View style={[styles.card, isTop && styles.cardTop]}>
      {isTop && (
        <View style={styles.choiceBadge}>
          <Text style={styles.choiceBadgeText}>AUGUR'S CHOICE</Text>
        </View>
      )}

      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardMake}>{car.make}</Text>
          <Text style={[styles.cardModel, isTop && styles.cardModelTop]}>{car.model}</Text>
        </View>
        <Text style={styles.cardYear}>{car.yearRange}</Text>
      </View>

      {/* AI summary — undefined = still loading, null = failed, string = done */}
      {summary === undefined ? (
        <View style={styles.summaryLoading}>
          <ActivityIndicator size="small" color={C.textMuted} />
          <Text style={styles.summaryLoadingText}>
            {timedOut ? "Sorry, this is taking longer than usual." : "Analysing records…"}
          </Text>
        </View>
      ) : summary ? (
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryText}>{summary}</Text>
          {recordsUsed > 0 && (
            <Text style={styles.summaryAttribution}>
              Based on {recordsUsed} verified record{recordsUsed !== 1 ? "s" : ""} · AI summary
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.tags}>
        {car.tags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.checkBtn, isTop && styles.checkBtnTop]}
        onPress={onCheck}
        activeOpacity={0.8}
      >
        <Text style={[styles.checkBtnText, isTop && styles.checkBtnTextTop]}>
          Check a {car.make} {car.model}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

// undefined = not yet fetched (show spinner), null = fetch failed (show nothing), object = done
type SummaryMap = Record<string, { summary: string; recordsUsed: number } | null | undefined>;

export default function RecommendationsScreen() {
  const router = useRouter();
  const [primary,   setPrimary]   = useState<CarRecommendation>(ALL_PICKS[0]);
  const [others,    setOthers]    = useState<CarRecommendation[]>(ALL_PICKS.slice(1));
  const [summaries, setSummaries] = useState<SummaryMap>({});
  const [timedOut,  setTimedOut]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("augur_persona").then((raw) => {
      const persona = raw ? JSON.parse(raw) : null;
      const { primary: p, others: o } = pickRecommendations(persona);
      setPrimary(p);
      setOthers(o);

      // After 4s, flip timedOut so any still-spinning cards show a message instead
      const timeout = setTimeout(() => setTimedOut(true), 4000);

      // Fetch primary immediately, then others staggered to avoid Groq rate limits
      fetchModelSummary(p).then((result) => {
        setSummaries((prev) => ({ ...prev, [p.id]: result }));
      });

      o.forEach((car, i) => {
        setTimeout(() => {
          fetchModelSummary(car).then((result) => {
            setSummaries((prev) => ({ ...prev, [car.id]: result }));
          });
        }, 1000 * (i + 1)); // 1s, 2s, 3s... between each
      });
    });
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Good picks for you</Text>
        <Text style={styles.subtitle}>
          Based on your preferences. Tap any card to start checking that model.
        </Text>
      </View>

      {/* ── Primary pick ── */}
      <CarCard
        isTop
        car={primary}
        summary={primary.id in summaries ? (summaries[primary.id]?.summary ?? null) : undefined}
        recordsUsed={summaries[primary.id]?.recordsUsed ?? 0}
        timedOut={timedOut}
        onCheck={() => router.push("/home")}
      />

      {/* ── Close choices ── */}
      <Text style={styles.sectionLabel}>Close choices</Text>
      {others.map((car) => (
        <CarCard
          key={car.id}
          isTop={false}
          car={car}
          summary={car.id in summaries ? (summaries[car.id]?.summary ?? null) : undefined}
          recordsUsed={summaries[car.id]?.recordsUsed ?? 0}
          timedOut={timedOut}
          onCheck={() => router.push("/home")}
        />
      ))}

      {/* ── CTA ── */}
      <TouchableOpacity
        style={styles.btn}
        onPress={() => router.replace("/dashboard")}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Go to dashboard</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 24, paddingBottom: 48 },

  // Header
  header:   { marginBottom: 24, marginTop: 16 },
  title:    { fontSize: 28, fontWeight: "800", color: C.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textMuted, lineHeight: 21 },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 12,
  },

  // Card base
  card: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    gap: 14,
  },
  // Top pick — accent ring
  cardTop: {
    borderWidth: 2,
    borderColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },

  // Augur's Choice badge
  choiceBadge: {
    alignSelf: "flex-start",
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  choiceBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: C.bg,
    letterSpacing: 1,
  },

  // Card internals
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardMake: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  cardModel:    { fontSize: 22, fontWeight: "800", color: C.textPrimary },
  cardModelTop: { fontSize: 24 },
  cardYear:     { fontSize: 13, color: C.textMuted, marginTop: 4 },
  cardPitch:    { fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 21 },

  // Summary
  summaryLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryLoadingText: {
    fontSize: 13,
    color: C.textMuted,
  },
  summaryTimeout: {
    fontSize: 13,
    color: C.textMuted,
    fontStyle: "italic",
  },
  summaryBlock: {
    gap: 6,
  },
  summaryText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.80)",
    lineHeight: 22,
  },
  summaryAttribution: {
    fontSize: 11,
    color: C.textMuted,
    fontStyle: "italic",
  },

  // Tags
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag:  {
    backgroundColor: C.tagBg,
    borderWidth: 1,
    borderColor: "rgba(194,214,53,0.25)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 12, fontWeight: "600", color: C.accent },

  // Check button
  checkBtn: {
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  checkBtnTop: {
    borderColor: C.accent,
    backgroundColor: "rgba(194,214,53,0.08)",
  },
  checkBtnText:    { fontSize: 14, fontWeight: "700", color: C.textMuted },
  checkBtnTextTop: { color: C.accent },

  // Bottom CTA
  btn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { fontSize: 16, fontWeight: "700", color: C.bg },
});
