import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";

const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.05)" as const,
  glassBorder: "rgba(255,255,255,0.10)" as const,
  accent:      "#c2d635",
  textPrimary: "#ffffff",
  textMuted:   "#888",
};

// ── Survey definition ─────────────────────────────────────────────────────────

const STEPS = [
  {
    key: "usage",
    question: "How will you mainly use it?",
    hint: "We'll focus the report on what matters most for your situation.",
    multi: false,
    options: [
      { key: "daily_commuter",  label: "Daily commuter",  desc: "Regular motorway or city driving, reliability is key." },
      { key: "family_car",      label: "Family car",      desc: "Safety ratings, space, and running costs front and centre." },
      { key: "cheap_car",       label: "Cheap car",       desc: "Just needs to work. Keeping costs as low as possible." },
      { key: "city_car",        label: "City car",        desc: "Size matters; easy to park, cheap to run." },
      { key: "workhorse",       label: "Workhorse",       desc: "Towing, carrying goods, or regular site use." },
    ],
  },
  {
    key: "body_type",
    question: "Any body type preference?",
    hint: "Pick everything you'd consider.",
    multi: true,
    options: [
      { key: "hatchback",    label: "Hatchback",      desc: "" },
      { key: "saloon",       label: "Saloon",          desc: "" },
      { key: "estate",       label: "Estate & Wagon",  desc: "" },
      { key: "suv",          label: "SUV",             desc: "" },
      { key: "coupe",        label: "Coupé",           desc: "" },
      { key: "convertible",  label: "Convertible",     desc: "" },
      { key: "pickup",       label: "Pickup & Van",    desc: "" },
    ],
  },
  {
    key: "budget",
    question: "Repair & maintenance budget?",
    hint: "Per year, roughly. Helps us flag cars likely to exceed it.",
    multi: false,
    options: [
      { key: "under_500",   label: "Under £500",       desc: "Needs to be very reliable — no surprises." },
      { key: "500_1500",    label: "£500 – £1,500",    desc: "Can handle occasional repair bills." },
      { key: "1500_3000",   label: "£1,500 – £3,000",  desc: "Comfortable with bigger jobs if the car is right." },
      { key: "no_limit",    label: "No set limit",     desc: "Quality matters more than running cost." },
    ],
  },
  {
    key: "seller",
    question: "Who are you buying from?",
    hint: "Private sales have fewer protections — we'll adjust our caution accordingly.",
    multi: false,
    options: [
      { key: "main_dealer",  label: "Main dealer",         desc: "Manufacturer-franchised, warranty-backed." },
      { key: "indie_dealer", label: "Independent dealer",  desc: "Local dealer, variable standards." },
      { key: "private",      label: "Private seller",      desc: "No consumer rights, buyer beware." },
      { key: "unsure",       label: "Not sure yet",        desc: "Still deciding." },
    ],
  },
] as const;

type StepKey = typeof STEPS[number]["key"];
type Answers = Record<StepKey, string | string[]>;

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Answers>>({});

  const current   = STEPS[step];
  const isMulti   = current.multi;
  const selected  = answers[current.key];
  const isLast    = step === STEPS.length - 1;

  const isSelected = (key: string) => {
    if (!selected) return false;
    if (isMulti) return (selected as string[]).includes(key);
    return selected === key;
  };

  const handleSelect = (key: string) => {
    if (isMulti) {
      const prev = (answers[current.key] as string[] | undefined) ?? [];
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      setAnswers(a => ({ ...a, [current.key]: next }));
    } else {
      setAnswers(a => ({ ...a, [current.key]: key }));
    }
  };

  const canAdvance = isMulti
    ? ((answers[current.key] as string[] | undefined)?.length ?? 0) > 0
    : !!answers[current.key];

  const handleNext = () => {
    if (isLast) {
      // TODO: persist answers to AsyncStorage under "augur_persona"
      router.replace("/dashboard");
    } else {
      setStep(s => s + 1);
    }
  };

  const useGrid = current.options.length >= 6;

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Progress bar ── */}
      <View style={styles.progressTrack}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSegment,
              i <= step && styles.progressSegmentActive,
            ]}
          />
        ))}
      </View>

      {/* ── Question ── */}
      <View style={styles.questionBlock}>
        <Text style={styles.stepLabel}>Step {step + 1} of {STEPS.length}</Text>
        <Text style={styles.question}>{current.question}</Text>
        {current.hint ? <Text style={styles.hint}>{current.hint}</Text> : null}
      </View>

      {/* ── Options ── */}
      <View style={[styles.options, useGrid && styles.optionsGrid]}>
        {current.options.map((opt) => {
          const active = isSelected(opt.key);
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.card,
                useGrid && styles.cardGrid,
                active && styles.cardActive,
              ]}
              onPress={() => handleSelect(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>
                {opt.label}
              </Text>
              {opt.desc ? (
                <Text style={[styles.cardDesc, active && styles.cardDescActive]}>
                  {opt.desc}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Navigation ── */}
      <View style={styles.nav}>
        {step > 0 ? (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        <TouchableOpacity
          style={[styles.nextBtn, !canAdvance && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!canAdvance}
          activeOpacity={0.8}
        >
          <Text style={[styles.nextText, !canAdvance && styles.nextTextDisabled]}>
            {isLast ? "Finish" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Skip ── */}
      <TouchableOpacity onPress={() => router.replace("/dashboard")} style={styles.skip}>
        <Text style={styles.skipText}>Skip survey</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },

  // ── Progress ──────────────────────────────────────────────────────────────────
  progressTrack: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 32,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressSegmentActive: {
    backgroundColor: C.accent,
  },

  // ── Question ──────────────────────────────────────────────────────────────────
  questionBlock: {
    marginBottom: 24,
  },
  stepLabel: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  question: {
    fontSize: 22,
    fontWeight: "700",
    color: C.textPrimary,
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    color: C.textMuted,
    lineHeight: 19,
  },

  // ── Options ───────────────────────────────────────────────────────────────────
  options: {
    flex: 1,
    gap: 10,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 12,
    padding: 14,
    gap: 3,
  },
  cardGrid: {
    width: "47%",
  },
  cardActive: {
    backgroundColor: "rgba(194,214,53,0.12)",
    borderColor: C.accent,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: C.textPrimary,
  },
  cardLabelActive: {
    color: C.accent,
  },
  cardDesc: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
  },
  cardDescActive: {
    color: "rgba(194,214,53,0.7)",
  },

  // ── Nav ───────────────────────────────────────────────────────────────────────
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  backText: {
    fontSize: 15,
    color: C.textMuted,
    fontWeight: "600",
  },
  nextBtn: {
    backgroundColor: C.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  nextBtnDisabled: {
    backgroundColor: "rgba(194,214,53,0.2)",
  },
  nextText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#080a07",
  },
  nextTextDisabled: {
    color: "rgba(194,214,53,0.4)",
  },

  // ── Skip ──────────────────────────────────────────────────────────────────────
  skip: {
    alignItems: "center",
  },
  skipText: {
    fontSize: 13,
    color: C.textMuted,
    textDecorationLine: "underline",
  },
});
