import * as Clipboard from 'expo-clipboard';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, ErrorText } from '@/components/form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/context/session';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api } from '@/lib/api';
import { shareGroupHistory } from '@/lib/export';
import { balancePhrase, formatMoney, formatWhen } from '@/lib/money';
import type { GroupDetail } from '@/lib/types';

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function GroupDetailScreen() {
  const theme = useTheme();
  const { userId } = useSession();
  const groupId = one(useLocalSearchParams<{ id: string }>().id);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !groupId) return;
    try {
      setGroup(await api.getGroup(userId, groupId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this group.');
    } finally {
      setRefreshing(false);
    }
  }, [groupId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const mine = group?.members.find((member) => member.id === userId)?.balance_cents ?? 0;
  const tone = mine > 0 ? 'positive' : mine < 0 ? 'negative' : 'text';

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}>
      <Stack.Screen options={{ title: group?.name ?? 'Group' }} />
      {group ? (
        <>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {group.kind === 'trip' ? 'Trip' : 'House'} · {group.currency}
            </ThemedText>
            <View style={styles.codeRow}>
              <ThemedText type="code" style={styles.code}>
                {group.invite_code}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  Clipboard.setStringAsync(group.invite_code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}>
                <ThemedText type="smallBold" themeColor="accent">
                  {copied ? 'Copied' : 'Copy code'}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText type="subtitle" themeColor={tone} style={styles.balance}>
              {balancePhrase(mine, group.currency)}
            </ThemedText>
          </Card>

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                label="Add expense"
                onPress={() => router.push({ pathname: '/group/[id]/expense', params: { id: group.id } })}
              />
            </View>
            <View style={styles.action}>
              <Button
                label={exporting ? 'Exporting…' : 'Export'}
                tone="secondary"
                disabled={exporting || !userId}
                onPress={async () => {
                  if (!userId) return;
                  setExporting(true);
                  setError(null);
                  try {
                    await shareGroupHistory(userId, group.id, group.name);
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : 'Could not export history.');
                  } finally {
                    setExporting(false);
                  }
                }}
              />
            </View>
          </View>

          <ThemedText type="smallBold">Who owes whom</ThemedText>
          {group.transfers.length === 0 ? (
            <ThemedText themeColor="textSecondary">Everyone is settled up.</ThemedText>
          ) : (
            group.transfers.map((transfer) => (
              <Pressable
                key={`${transfer.from_user_id}-${transfer.to_user_id}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/group/[id]/settle',
                    params: {
                      id: group.id,
                      from: transfer.from_user_id,
                      to: transfer.to_user_id,
                      amount: String(transfer.amount_cents),
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText>
                  {transfer.from_name} owes {transfer.to_name} {formatMoney(transfer.amount_cents, group.currency)}
                </ThemedText>
                <ThemedText type="small" themeColor="accent">
                  Settle
                </ThemedText>
              </Pressable>
            ))
          )}

          <ThemedText type="smallBold">People</ThemedText>
          <Card>
            {group.members.map((member) => (
              <View key={member.id} style={styles.member}>
                <ThemedText>{member.id === userId ? `${member.display_name} (you)` : member.display_name}</ThemedText>
                <ThemedText
                  type="small"
                  themeColor={member.balance_cents > 0 ? 'positive' : member.balance_cents < 0 ? 'negative' : 'textSecondary'}>
                  {member.balance_cents === 0
                    ? 'Settled'
                    : member.balance_cents > 0
                      ? `Owed ${formatMoney(member.balance_cents, group.currency)}`
                      : `Owes ${formatMoney(Math.abs(member.balance_cents), group.currency)}`}
                </ThemedText>
              </View>
            ))}
          </Card>

          <ThemedText type="smallBold">History</ThemedText>
          {group.activity.length === 0 ? (
            <ThemedText themeColor="textSecondary">No expenses yet.</ThemedText>
          ) : (
            group.activity.map((item) =>
              item.type === 'expense' ? (
                <Card key={item.id}>
                  <View style={styles.member}>
                    <ThemedText>{item.description}</ThemedText>
                    <ThemedText type="smallBold">{formatMoney(item.amount_cents, group.currency)}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.payer_name} paid · {item.split_type} · {formatWhen(item.created_at)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.shares
                      .map((share) => `${share.display_name} ${formatMoney(share.amount_cents, group.currency)}`)
                      .join(' · ')}
                  </ThemedText>
                </Card>
              ) : (
                <Card key={item.id}>
                  <ThemedText>
                    {item.from_name} paid {item.to_name} {formatMoney(item.amount_cents, group.currency)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Settlement · {formatWhen(item.created_at)}
                  </ThemedText>
                </Card>
              ),
            )
          )}
        </>
      ) : (
        <ThemedText themeColor="textSecondary">{error ? '' : 'Loading group…'}</ThemedText>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  code: {
    fontSize: 20,
    letterSpacing: 3,
  },
  balance: {
    fontSize: 28,
    lineHeight: 34,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
  },
  row: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  member: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
