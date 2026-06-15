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

export default function HomeScreen() {
  const [reg, setReg] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    const cleaned = reg.trim().toUpperCase().replace(/\s/g, "");
    if (!cleaned) return;
    router.push(`/results?reg=${cleaned}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Augur</Text>
        <Text style={styles.subtitle}>Used car intelligence</Text>

        <View style={styles.plateContainer}>
          <View style={styles.plateStripe} />
          <TextInput
            style={styles.plateInput}
            value={reg}
            onChangeText={setReg}
            placeholder="AB15 XYZ"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onSubmitEditing={handleSearch}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSearch}>
          <Text style={styles.buttonText}>Check this car</Text>
        </TouchableOpacity>
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
  button: {
    backgroundColor: "#1a1a1a",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
