import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";

// A VIN is always exactly 17 alphanumeric characters (no I, O, Q)
function isVIN(input: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(input);
}

export default function HomeScreen() {
  const [mode, setMode] = useState<"reg" | "vin">("reg");
  const [input, setInput] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    const cleaned = input.trim().toUpperCase().replace(/\s/g, "");
    if (!cleaned) return;
    if (mode === "vin") {
      router.push(`/results?vin=${cleaned}`);
    } else {
      router.push(`/results?reg=${cleaned}`);
    }
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
        <Text style={styles.title}>Augur</Text>
        <Text style={styles.subtitle}>Used car intelligence</Text>

        {mode === "reg" ? (
          <View style={styles.plateContainer}>
            <View style={styles.plateStripe} />
            <TextInput
              style={styles.plateInput}
              value={input}
              onChangeText={setInput}
              placeholder="AB15 XYZ"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              onSubmitEditing={handleSearch}
            />
          </View>
        ) : (
          <View style={styles.vinContainer}>
            <TextInput
              style={styles.vinInput}
              value={input}
              onChangeText={setInput}
              placeholder="e.g. WF0FXXGCHF8R12345"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={17}
              onSubmitEditing={handleSearch}
            />
            <Text style={styles.vinHint}>17-character Vehicle Identification Number</Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleSearch}>
          <Text style={styles.buttonText}>Check this car</Text>
        </TouchableOpacity>

        {mode === "reg" ? (
          <TouchableOpacity onPress={() => switchMode("vin")}>
            <Text style={styles.switchLink}>Search by VIN instead</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => switchMode("reg")}>
            <Text style={styles.switchLink}>Search by Registration Plate instead</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#1a1a1a",
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 48,
  },

  // ── Reg plate input ──────────────────────────────────────────────────────────
  plateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f7d94c",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#1a1a1a",
    marginBottom: 24,
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

  // ── VIN input ────────────────────────────────────────────────────────────────
  vinContainer: {
    width: "100%",
    maxWidth: 320,
    marginBottom: 24,
  },
  vinInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#1a1a1a",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 2,
    color: "#1a1a1a",
    paddingVertical: 18,
    paddingHorizontal: 12,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  vinHint: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 6,
  },

  // ── Shared ───────────────────────────────────────────────────────────────────
  button: {
    backgroundColor: "#1a1a1a",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchLink: {
    fontSize: 14,
    color: "#555",
    textDecorationLine: "underline",
  },
});
