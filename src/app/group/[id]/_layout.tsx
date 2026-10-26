import { Stack } from 'expo-router';

export default function GroupStack() {
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Group' }} />
      <Stack.Screen name="expense" options={{ title: 'Add expense' }} />
      <Stack.Screen name="settle" options={{ title: 'Settle up' }} />
    </Stack>
  );
}
