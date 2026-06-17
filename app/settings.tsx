import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";

const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  danger:      "#e05530",
  textPrimary: "#ffffff",
  textMuted:   "#888",
};

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Profile</Text>
        <TouchableOpacity style={styles.row} onPress={() => router.push("/onboarding")}>
          <Text style={styles.rowLabel}>Retake survey</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <TouchableOpacity style={styles.row} onPress={() => {}}>
          <Text style={styles.rowLabel}>Change password</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => router.replace("/")}>
          <Text style={[styles.rowLabel, { color: C.danger }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Data sources</Text>
          <Text style={styles.rowValue}>DVSA · Honest John</Text>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderBottomWidth: 0,
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLast: {
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontSize: 15,
    color: C.textPrimary,
  },
  rowChevron: {
    fontSize: 18,
    color: C.textMuted,
  },
  rowValue: {
    fontSize: 14,
    color: C.textMuted,
  },
});
