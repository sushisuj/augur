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

const C = {
  bg:          "#080a07",
  surface:     "rgba(255,255,255,0.05)",
  border:      "rgba(255,255,255,0.10)",
  accent:      "#c2d635",
  textPrimary: "#ffffff",
  textMuted:   "#888",
  danger:      "#e05530",
};

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab]           = useState<"login" | "register">("login");
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });

  const handleContinue = () => {
    // Mock auth — just route through
    router.replace("/dashboard");
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
        <Text style={styles.tagline}>Confidence without Expertise</Text>

        {/* ── Tab switcher ── */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === "login" && styles.tabActive]}
            onPress={() => setTab("login")}
          >
            <Text style={[styles.tabText, tab === "login" && styles.tabTextActive]}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "register" && styles.tabActive]}
            onPress={() => setTab("register")}
          >
            <Text style={[styles.tabText, tab === "register" && styles.tabTextActive]}>Create account</Text>
          </TouchableOpacity>
        </View>

        {/* ── Form ── */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor={C.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={C.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
          {tab === "register" && (
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={C.textMuted}
              secureTextEntry
              autoCapitalize="none"
            />
          )}
        </View>

        {/* ── CTA ── */}
        <TouchableOpacity style={styles.button} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.buttonText}>
            {tab === "login" ? "Sign in" : "Create account"}
          </Text>
        </TouchableOpacity>

        {/* ── Forgot password ── */}
        {tab === "login" && (
          <TouchableOpacity onPress={() => {}}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  // ── Branding ──────────────────────────────────────────────────────────────────
  logo: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  title: {
    fontSize: 52,
    color: C.textPrimary,
    letterSpacing: 4,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 12,
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 40,
  },

  // ── Tab ───────────────────────────────────────────────────────────────────────
  tabRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    marginBottom: 20,
    width: "100%",
    maxWidth: 320,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: C.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.textMuted,
  },
  tabTextActive: {
    color: "#080a07",
  },

  // ── Form ──────────────────────────────────────────────────────────────────────
  form: {
    width: "100%",
    maxWidth: 320,
    gap: 10,
    marginBottom: 14,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: C.textPrimary,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────────
  button: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 10,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#080a07",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Forgot ────────────────────────────────────────────────────────────────────
  forgotText: {
    fontSize: 13,
    color: C.textMuted,
    textDecorationLine: "underline",
  },
});
