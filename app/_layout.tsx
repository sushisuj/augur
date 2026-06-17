import { Stack } from "expo-router";

const headerDark = {
  headerStyle:          { backgroundColor: "#080a07" },
  headerTintColor:      "#ffffff",
  headerShadowVisible:  false,
};

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"      options={{ headerShown: false }} />
      <Stack.Screen name="dashboard"  options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: "Your Profile", ...headerDark }} />
      <Stack.Screen name="home"       options={{ title: "Augur",          ...headerDark }} />
      <Stack.Screen name="results"    options={{ title: "Vehicle Report", ...headerDark }} />
      <Stack.Screen name="diagnose"   options={{ title: "Diagnose",       ...headerDark }} />
      <Stack.Screen name="settings"   options={{ title: "Settings",       ...headerDark }} />
    </Stack>
  );
}
