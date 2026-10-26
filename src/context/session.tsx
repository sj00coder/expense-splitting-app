import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, api } from '@/lib/api';

const USER_KEY = 'split.userId';
const NAME_KEY = 'split.displayName';

type SessionValue = {
  ready: boolean;
  userId: string | null;
  displayName: string | null;
  saveName: (name: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

let userIdPromise: Promise<string> | null = null;

function createUserId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function loadUserId() {
  if (!userIdPromise) {
    userIdPromise = (async () => {
      const existing = await AsyncStorage.getItem(USER_KEY);
      if (existing) return existing;
      const created = createUserId();
      await AsyncStorage.setItem(USER_KEY, created);
      return created;
    })();
  }
  return userIdPromise;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await loadUserId();
      let name: string | null = null;
      try {
        const me = await api.getMe(id);
        name = me.display_name;
        await AsyncStorage.setItem(NAME_KEY, name);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) {
          name = await AsyncStorage.getItem(NAME_KEY);
        }
      }
      if (!cancelled) {
        setUserId(id);
        setDisplayName(name);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveName = useCallback(
    async (name: string) => {
      if (!userId) throw new Error('Session is not ready');
      const me = await api.saveMe(userId, name.trim());
      await AsyncStorage.setItem(NAME_KEY, me.display_name);
      setDisplayName(me.display_name);
    },
    [userId],
  );

  const value = useMemo(
    () => ({ ready, userId, displayName, saveName }),
    [ready, userId, displayName, saveName],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
