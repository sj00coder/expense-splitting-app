import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

function subscribe() {
  return () => undefined;
}

/**
 * Static rendering does not know the device color scheme. Keep the server HTML on light,
 * then use the device scheme after hydration.
 */
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? colorScheme : 'light';
}
