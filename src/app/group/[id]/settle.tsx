import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { Button, Choice, ErrorText, Field } from '@/components/form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/context/session';
import { ApiError, api } from '@/lib/api';
import { centsToInput, parseCents } from '@/lib/money';
import type { GroupDetail } from '@/lib/types';

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function SettleScreen() {
  const { userId } = useSession();
  const params = useLocalSearchParams<{ id: string; from?: string; to?: string; amount?: string }>();
  const groupId = one(params.id);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !groupId) return;
    try {
      setGroup(await api.getGroup(userId, groupId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this group.');
    }
  }, [groupId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!group || !userId) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">{error ? '' : 'Loading group…'}</ThemedText>
        <ErrorText>{error}</ErrorText>
      </Screen>
    );
  }

  return (
    <SettleForm
      key={`${group.id}:${one(params.from)}:${one(params.to)}:${one(params.amount)}`}
      group={group}
      userId={userId}
      from={one(params.from)}
      to={one(params.to)}
      amount={one(params.amount)}
    />
  );
}

function SettleForm({
  group,
  userId,
  from,
  to,
  amount,
}: {
  group: GroupDetail;
  userId: string;
  from: string;
  to: string;
  amount: string;
}) {
  const fallbackFrom = group.members.some((member) => member.id === userId) ? userId : (group.members[0]?.id ?? '');
  const initialFrom = group.members.some((member) => member.id === from) ? from : fallbackFrom;
  const initialTo = group.members.some((member) => member.id === to)
    ? to
    : (group.members.find((member) => member.id !== initialFrom)?.id ?? '');
  const [fromId, setFromId] = useState(initialFrom);
  const [toId, setToId] = useState(initialTo);
  const [amountText, setAmountText] = useState(/^\d+$/.test(amount) ? centsToInput(Number(amount)) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = group.members.map((member) => ({
    value: member.id,
    label: member.id === userId ? `${member.display_name} (you)` : member.display_name,
  }));

  async function onSave() {
    const cents = parseCents(amountText);
    if (!fromId || !toId) {
      setError('Choose who paid and who received it.');
      return;
    }
    if (fromId === toId) {
      setError('A settlement needs two different people.');
      return;
    }
    if (!cents) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addSettlement(userId, group.id, {
        from_user_id: fromId,
        to_user_id: toId,
        amount_cents: cents,
      });
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not record the settlement.');
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">Record money that someone already paid back.</ThemedText>
      <Choice label="From" value={fromId} onChange={setFromId} options={options} />
      <Choice label="To" value={toId} onChange={setToId} options={options} />
      <Field
        label={`Amount (${group.currency})`}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <ErrorText>{error}</ErrorText>
      <Button label={saving ? 'Saving…' : 'Record settlement'} disabled={saving} onPress={onSave} />
    </Screen>
  );
}
