import { Stack } from "expo-router";

const headerDark = {
  headerStyle:          { backgroundColor: "#0d0f0a" },
  headerTintColor:      "#e8e6e0",
  headerShadowVisible:  false,
};

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"   options={{ title: "Augur",          ...headerDark }} />
      <Stack.Screen name="results" options={{ title: "Vehicle Report", ...headerDark }} />
      <Stack.Screen name="diagnose" options={{ title: "Diagnose",      ...headerDark }} />
    </Stack>
  );
}
