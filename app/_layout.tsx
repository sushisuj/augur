import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Augur" }} />
      <Stack.Screen name="results" options={{ title: "Vehicle Report" }} />
    </Stack>
  );
}
