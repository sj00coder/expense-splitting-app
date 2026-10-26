import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Choice, ErrorText, Field } from '@/components/form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/context/session';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api } from '@/lib/api';
import { balancePhrase, CURRENCIES } from '@/lib/money';
import type { GroupSummary, Kind } from '@/lib/types';

export default function GroupsScreen() {
  const theme = useTheme();
  const { userId, displayName } = useSession();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('trip');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !displayName) {
      setGroups([]);
      setLoading(false);
      return;
    }
    try {
      setGroups(await api.listGroups(userId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load groups.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [displayName, userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function createGroup() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const group = await api.createGroup(userId, { name, kind, currency });
      setName('');
      setMode('none');
      router.push(`/group/${group.id}` as Href);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the group.');
    } finally {
      setSaving(false);
    }
  }

  async function joinGroup() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const group = await api.joinGroup(userId, code);
      setCode('');
      setMode('none');
      router.push(`/group/${group.id}` as Href);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not join the group.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      tab
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Groups</ThemedText>
        <ThemedText themeColor="textSecondary">Trips and houses, split as you go.</ThemedText>
      </View>

      {!displayName ? (
        <Card>
          <ThemedText>Add your name on Profile before you create or join a group.</ThemedText>
          <Button label="Open Profile" onPress={() => router.push('/profile')} />
        </Card>
      ) : (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label="New group"
              tone={mode === 'create' ? 'primary' : 'secondary'}
              onPress={() => setMode(mode === 'create' ? 'none' : 'create')}
            />
          </View>
          <View style={styles.action}>
            <Button
              label="Join"
              tone={mode === 'join' ? 'primary' : 'secondary'}
              onPress={() => setMode(mode === 'join' ? 'none' : 'join')}
            />
          </View>
        </View>
      )}

      {mode === 'create' && displayName ? (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Lisbon or Flat 4" />
          <Choice
            label="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'trip', label: 'Trip' },
              { value: 'house', label: 'House' },
            ]}
          />
          <Choice
            label="Currency"
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((item) => ({ value: item, label: item }))}
          />
          <Button label={saving ? 'Creating…' : 'Create group'} disabled={saving || !name.trim()} onPress={createGroup} />
        </Card>
      ) : null}

      {mode === 'join' && displayName ? (
        <Card>
          <Field
            label="Invite code"
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="AB23CD"
          />
          <Button label={saving ? 'Joining…' : 'Join group'} disabled={saving || code.length !== 6} onPress={joinGroup} />
        </Card>
      ) : null}

      <ErrorText>{error}</ErrorText>

      {loading && groups.length === 0 ? <ThemedText themeColor="textSecondary">Loading groups…</ThemedText> : null}

      {!loading && displayName && groups.length === 0 ? (
        <ThemedText themeColor="textSecondary">No groups yet. Start one, or join with a code.</ThemedText>
      ) : null}

      {groups.map((group) => {
        const tone = group.my_balance_cents > 0 ? 'positive' : group.my_balance_cents < 0 ? 'negative' : 'textSecondary';
        return (
          <Pressable
            key={group.id}
            accessibilityRole="button"
            onPress={() => router.push(`/group/${group.id}` as Href)}
            style={({ pressed }) => [styles.group, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
            <View style={styles.groupTop}>
              <ThemedText type="default" style={styles.groupName}>
                {group.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {group.kind === 'trip' ? 'Trip' : 'House'} · {group.member_count}{' '}
                {group.member_count === 1 ? 'person' : 'people'}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" themeColor={tone}>
              {balancePhrase(group.my_balance_cents, group.currency)}
            </ThemedText>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
  },
  group: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  groupTop: {
    gap: Spacing.half,
  },
  groupName: {
    fontSize: 18,
  },
});
