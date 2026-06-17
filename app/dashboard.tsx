import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";

const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  accent:      "#c2d635",
  textPrimary: "#ffffff",
  textMuted:   "#888",
};

export default function DashboardScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >

      {/* ── Wordmark ── */}
      <View style={styles.header}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.title, fontsLoaded && { fontFamily: "BebasNeue_400Regular" }]}>
          Augur
        </Text>
        <Text style={styles.subtitle}>What would you like to do?</Text>
      </View>

      {/* ── Options ── */}
      <View style={styles.options}>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/home")}
          activeOpacity={0.75}
        >
          <Text style={styles.cardIcon}>🔍</Text>
          <Text style={styles.cardTitle}>Check a car</Text>
          <Text style={styles.cardDesc}>
            Enter a reg plate or VIN to get a full MOT history, reliability report, and buyer verdict.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/diagnose")}
          activeOpacity={0.75}
        >
          <Text style={styles.cardIcon}>🔧</Text>
          <Text style={styles.cardTitle}>Diagnose a symptom</Text>
          <Text style={styles.cardDesc}>
            Noticed something on a test drive or your own car? Describe it and we'll match it against known faults for that model.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/onboarding")}
          activeOpacity={0.75}
        >
          <Text style={styles.cardIcon}>📋</Text>
          <Text style={styles.cardTitle}>Set up your profile</Text>
          <Text style={styles.cardDesc}>
            Tell us how you'll use your next car and we'll tailor every report to what matters most to you.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/settings")}
          activeOpacity={0.75}
        >
          <Text style={styles.cardIcon}>⚙️</Text>
          <Text style={styles.cardTitle}>Settings</Text>
          <Text style={styles.cardDesc}>
            Manage your account and preferences.
          </Text>
        </TouchableOpacity>

      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 48,
    color: C.textPrimary,
    letterSpacing: 4,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: C.textMuted,
  },

  // ── Option cards ─────────────────────────────────────────────────────────────
  options: {
    gap: 14,
  },
  card: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.textPrimary,
  },
  cardDesc: {
    fontSize: 14,
    color: C.textMuted,
    lineHeight: 20,
  },
});
