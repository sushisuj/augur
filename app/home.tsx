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
  const [mode, setMode] = useState<"reg" | "vin">("reg");
  const [input, setInput] = useState("");
  const router = useRouter();

  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });

  const handleSearch = () => {
    const cleaned = input.trim().toUpperCase().replace(/\s/g, "");
    if (!cleaned) return;
    router.push(mode === "vin" ? `/results?vin=${cleaned}` : `/results?reg=${cleaned}`);
  };

  const switchMode = (next: "reg" | "vin") => {
    setMode(next);
    setInput("");
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
        ) : (
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
        )}

        {/* ── CTA ── */}
        <TouchableOpacity style={styles.button} onPress={handleSearch} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Check this car</Text>
        </TouchableOpacity>

        {/* ── Mode toggle ── */}
        <TouchableOpacity onPress={() => switchMode(mode === "reg" ? "vin" : "reg")}>
          <Text style={styles.switchLink}>
            {mode === "reg" ? "Search by VIN instead" : "Search by Registration Plate instead"}
          </Text>
        </TouchableOpacity>

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
  buttonText: {
    color: "#080a07",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Mode switch ──────────────────────────────────────────────────────────────
  switchLink: {
    fontSize: 13,
    color: C.textMuted,
    textDecorationLine: "underline",
  },
});
