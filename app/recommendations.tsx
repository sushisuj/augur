import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  pitch: string;
  tags: string[];
  bodyTypes: string[]; // which persona body_type keys this matches
};

const ALL_PICKS: CarRecommendation[] = [
  {
    id: "golf-mk7",
    make: "Volkswagen",
    model: "Golf",
    yearRange: "2013 – 2020",
    pitch:
      "The Mk7 is the benchmark used hatchback. Solid build, huge choice of engines, and enough supply that you can afford to be picky. The 1.4 TSI and 1.6 TDI are the sweet spots — avoid early 1.2 TSI units with high mileage.",
    tags: ["Hatchback", "Manual / Auto", "Wide availability", "Watch: DSG service history"],
    bodyTypes: ["hatchback"],
  },
  {
    id: "3series-f30",
    make: "BMW",
    model: "3 Series",
    yearRange: "2012 – 2019",
    pitch:
      "The F30 is the go-to used saloon. Wide availability, strong parts support, and the 320d is genuinely solid when the service history checks out. Avoid anything with a timing chain rattle or signs of skipped oil services.",
    tags: ["Saloon", "Rear-wheel drive", "Strong parts support", "Watch: timing chain"],
    bodyTypes: ["saloon"],
  },
  {
    id: "octavia-estate",
    make: "Skoda",
    model: "Octavia Estate",
    yearRange: "2013 – 2020",
    pitch:
      "The best value estate on the used market. Golf underpinnings with a boot that embarrasses cars twice the price. The 1.6 TDI is the workhorse pick — reliable, cheap to run, parts everywhere.",
    tags: ["Estate", "Exceptional practicality", "VW Group platform", "Watch: DPF on short runs"],
    bodyTypes: ["estate"],
  },
  {
    id: "rav4-mk4",
    make: "Toyota",
    model: "RAV4",
    yearRange: "2013 – 2018",
    pitch:
      "Hybrid option, bulletproof reliability reputation, and none of the PCP horror stories you get with German SUVs. Slightly dull to drive but that's not why you buy one.",
    tags: ["SUV", "Hybrid available", "Exceptional reliability", "Watch: rust on older examples"],
    bodyTypes: ["suv"],
  },
  {
    id: "4series-f32",
    make: "BMW",
    model: "4 Series",
    yearRange: "2013 – 2020",
    pitch:
      "Looks sharper than the 3 Series with the same mechanicals underneath. A coupé that genuinely drives well. Watch for timing chain issues on early 2.0-litre petrol units — same caveat as its saloon sibling.",
    tags: ["Coupé", "Rear-wheel drive", "Strong depreciation benefit", "Watch: timing chain"],
    bodyTypes: ["coupe"],
  },
  {
    id: "mx5-nd",
    make: "Mazda",
    model: "MX-5",
    yearRange: "2015 – present",
    pitch:
      "Nothing else at this price comes close for driver involvement. The ND generation is reliable, well-built, and holds its value. Rust is the main concern on older examples — check the sills carefully.",
    tags: ["Convertible", "Driver's car", "Reliable hood mechanism", "Watch: sill rust"],
    bodyTypes: ["convertible"],
  },
  {
    id: "ranger-mk4",
    make: "Ford",
    model: "Ranger",
    yearRange: "2012 – 2022",
    pitch:
      "Dominates the UK pickup market for a reason. The double cab is practical enough for daily use, and parts are everywhere. The 2.2 TDCi is the pick — proven, tuneable, and easy to service.",
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
  onCheck,
}: {
  car: CarRecommendation;
  isTop: boolean;
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

      <Text style={styles.cardPitch}>{car.pitch}</Text>

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

export default function RecommendationsScreen() {
  const router = useRouter();
  const [primary, setPrimary] = useState<CarRecommendation>(ALL_PICKS[0]);
  const [others,  setOthers]  = useState<CarRecommendation[]>(ALL_PICKS.slice(1));

  useEffect(() => {
    AsyncStorage.getItem("augur_persona").then((raw) => {
      const persona = raw ? JSON.parse(raw) : null;
      const { primary: p, others: o } = pickRecommendations(persona);
      setPrimary(p);
      setOthers(o);
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
      <CarCard isTop car={primary} onCheck={() => router.push("/home")} />

      {/* ── Close choices ── */}
      <Text style={styles.sectionLabel}>Close choices</Text>
      {others.map((car) => (
        <CarCard key={car.id} isTop={false} car={car} onCheck={() => router.push("/home")} />
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
