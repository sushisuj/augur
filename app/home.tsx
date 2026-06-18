import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:         "#080a07",
  surface:    "#131510",
  border:     "#1f2118",
  accent:     "#c2d635",
  accentDark: "#c2d635",
  textPrimary:"#e8e6e0",
  textMuted:  "#888",
};

export default function HomeScreen() {
  const [mode, setMode] = useState<"reg" | "vin" | "make_model">("reg");
  const [input, setInput] = useState("");
  const [make,  setMake]  = useState("");
  const [model, setModel] = useState("");
  const [year,  setYear]  = useState("");
  const router = useRouter();

  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });

  const normaliseReg = (raw: string): string => {
    const stripped = raw.trim().toUpperCase().replace(/\s/g, "");
    // Standard UK format: AA00 AAA (7 chars) → insert space at position 4
    if (stripped.length === 7) return `${stripped.slice(0, 4)} ${stripped.slice(4)}`;
    // Older formats: A000 AAA or AA0 0000 etc. — just return as-is with the space
    // already handled by the user, or let the API deal with it
    return stripped;
  };

  const handleSearch = () => {
    if (mode === "make_model") {
      if (!make.trim() || !model.trim() || !year.trim()) return;
      const qs = new URLSearchParams({ make: make.trim(), model: model.trim(), year: year.trim() });
      router.push(`/model-report?${qs}`);
    } else if (mode === "vin") {
      if (!input.trim()) return;
      const vin = input.trim().toUpperCase().replace(/\s/g, "");
      router.push(`/results?vin=${vin}`);
    } else {
      if (!input.trim()) return;
      const reg = normaliseReg(input);
      router.push(`/results?reg=${encodeURIComponent(reg)}`);
    }
  };

  const canSearch = mode === "make_model"
    ? !!(make.trim() && model.trim() && year.trim())
    : !!input.trim();

  const switchMode = (next: "reg" | "vin" | "make_model") => {
    setMode(next);
    setInput("");
    setMake(""); setModel(""); setYear("");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>

        {/* ── Logo + Wordmark ── */}
        <Image
          source={require("../assets/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.title, fontsLoaded && { fontFamily: "BebasNeue_400Regular" }]}>
          Augur
        </Text>
        <Text style={styles.subtitle}>Confidence without Expertise</Text>

        {/* ── Input ── */}
        {mode === "reg" ? (
          <View style={styles.plateContainer}>
            <View style={styles.plateStripe} />
            <TextInput
              style={styles.plateInput}
              value={input}
              onChangeText={setInput}
              placeholder="AB15 XYZ"
              placeholderTextColor="#aaaaaa"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              onSubmitEditing={handleSearch}
            />
            <View style={styles.plateStripeSpacer} />
          </View>
        ) : mode === "vin" ? (
          <View style={styles.vinContainer}>
            <TextInput
              style={styles.vinInput}
              value={input}
              onChangeText={setInput}
              placeholder="WF0FXXGCHF8R12345"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={17}
              onSubmitEditing={handleSearch}
            />
            <Text style={styles.vinHint}>17-character Vehicle Identification Number</Text>
          </View>
        ) : (
          <View style={styles.makeModelContainer}>
            <TextInput
              style={styles.makeModelInput}
              value={make}
              onChangeText={setMake}
              placeholder="Make  (e.g. Ford)"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />
            <TextInput
              style={styles.makeModelInput}
              value={model}
              onChangeText={setModel}
              placeholder="Model  (e.g. Focus)"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.makeModelInput, styles.makeModelInputYear]}
              value={year}
              onChangeText={setYear}
              placeholder="Year  (e.g. 2018)"
              placeholderTextColor={C.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <Text style={styles.vinHint}>Shows model-level faults, recalls and reliability data</Text>
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity
          style={[styles.button, !canSearch && styles.buttonDisabled]}
          onPress={handleSearch}
          activeOpacity={0.85}
          disabled={!canSearch}
        >
          <Text style={styles.buttonText}>
            {mode === "make_model" ? "Check this model" : "Check this car"}
          </Text>
        </TouchableOpacity>

        {/* ── Mode toggles ── */}
        <View style={styles.switchLinks}>
          {mode !== "reg" && (
            <TouchableOpacity onPress={() => switchMode("reg")}>
              <Text style={styles.switchLink}>Search by reg plate</Text>
            </TouchableOpacity>
          )}
          {mode !== "vin" && (
            <TouchableOpacity onPress={() => switchMode("vin")}>
              <Text style={styles.switchLink}>Search by VIN</Text>
            </TouchableOpacity>
          )}
          {mode !== "make_model" && (
            <TouchableOpacity onPress={() => switchMode("make_model")}>
              <Text style={styles.switchLink}>Don't have the reg?</Text>
            </TouchableOpacity>
          )}
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  // ── Logo ─────────────────────────────────────────────────────────────────────
  logo: {
    width: 100,
    height: 100,
    marginBottom: 8,
  },

  // ── Wordmark ─────────────────────────────────────────────────────────────────
  title: {
    fontSize: 56,
    color: C.textPrimary,
    letterSpacing: 4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 40,
  },

  // ── Reg plate ────────────────────────────────────────────────────────────────
  plateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#1a1a1a",
    marginBottom: 16,
    overflow: "hidden",
    width: "100%",
    maxWidth: 320,
  },
  plateStripe: {
    width: 12,
    alignSelf: "stretch",
    backgroundColor: "#003399",
  },
  plateInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 4,
    color: "#1a1a1a",
    paddingVertical: 16,
  },
  plateStripeSpacer: {
    width: 12,
  },

  // ── VIN input ────────────────────────────────────────────────────────────────
  vinContainer: {
    width: "100%",
    maxWidth: 320,
    marginBottom: 16,
  },
  vinInput: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 2,
    color: C.textPrimary,
    paddingVertical: 18,
    paddingHorizontal: 12,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  vinHint: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: "center",
    marginTop: 6,
  },

  // ── Make / Model / Year ───────────────────────────────────────────────────────
  makeModelContainer: {
    width: "100%",
    maxWidth: 320,
    gap: 10,
    marginBottom: 16,
  },
  makeModelInput: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 16,
    fontWeight: "600",
    color: C.textPrimary,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  makeModelInputYear: {
    // narrower feel for a 4-digit field — same height, just visual distinction
    letterSpacing: 2,
  },

  // ── Button ───────────────────────────────────────────────────────────────────
  button: {
    backgroundColor: C.accentDark,
    paddingVertical: 16,
    borderRadius: 10,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: "#080a07",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Mode switch ──────────────────────────────────────────────────────────────
  switchLinks: {
    alignItems: "center",
    gap: 10,
  },
  switchLink: {
    fontSize: 13,
    color: C.textMuted,
    textDecorationLine: "underline",
  },
});
