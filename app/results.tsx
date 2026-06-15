import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

const SUPABASE_FUNCTION_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/vehicle-lookup";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";

type Fault = {
  fault_description: string;
  fault_category: string;
  severity: string;
};

type VehicleResult = {
  vehicle: { make: string; model: string; year: number; reg: string };
  summary: string;
  faults: Fault[];
  fault_count: number;
};

const SEVERITY_COLOR: Record<string, string> = {
  High: "#e53e3e",
  Medium: "#dd6b20",
  Low: "#38a169",
};

export default function ResultsScreen() {
  const { reg } = useLocalSearchParams<{ reg: string }>();
  const [data, setData] = useState<VehicleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reg) return;
    fetchVehicle(reg);
  }, [reg]);

  const fetchVehicle = async (registration: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${SUPABASE_FUNCTION_URL}?reg=${registration}`,
        {
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
        <Text style={styles.loadingText}>Checking {reg}...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load: {error}</Text>
      </View>
    );
  }

  if (!data) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Vehicle header */}
      <View style={styles.vehicleCard}>
        <Text style={styles.reg}>{data.vehicle.reg}</Text>
        <Text style={styles.vehicleName}>
          {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
        </Text>
      </View>

      {/* AI Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buyer Summary</Text>
        <Text style={styles.summary}>{data.summary}</Text>
      </View>

      {/* Fault list */}
      {data.faults.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Known Faults ({data.fault_count})
          </Text>
          {data.faults.map((fault, i) => {
            return (
              <View key={i} style={styles.faultCard}>
                <View style={styles.faultHeader}>
                  <Text style={styles.faultCategory}>
                    {fault.fault_category}
                  </Text>
                  <View
                    style={[
                      styles.severityBadge,
                      { backgroundColor: SEVERITY_COLOR[fault.severity] ?? "#999" },
                    ]}
                  >
                    <Text style={styles.severityText}>{fault.severity}</Text>
                  </View>
                </View>
                <Text style={styles.faultDescription}>
                  {fault.fault_description}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { color: "#666", fontSize: 16 },
  errorText: { color: "#e53e3e", fontSize: 16 },
  vehicleCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  reg: {
    color: "#f7d94c",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 4,
  },
  vehicleName: { color: "#fff", fontSize: 18, marginTop: 4 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  summary: { fontSize: 16, color: "#1a1a1a", lineHeight: 24 },
  faultCard: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
    marginTop: 12,
  },
  faultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  faultCategory: { fontSize: 13, fontWeight: "600", color: "#444" },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  faultDescription: { fontSize: 14, color: "#555", lineHeight: 20 },
});
