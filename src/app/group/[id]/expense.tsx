import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Choice, ErrorText, Field } from '@/components/form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/context/session';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api } from '@/lib/api';
import { formatMoney, parseCents, parseCentsAllowZero } from '@/lib/money';
import { SplitError, splitEqual, splitShares } from '@/lib/splits';
import type { GroupDetail, SplitType } from '@/lib/types';

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function AddExpenseScreen() {
  const { userId } = useSession();
  const groupId = one(useLocalSearchParams<{ id: string }>().id);
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

  return <ExpenseForm key={group.id} group={group} userId={userId} />;
}

function ExpenseForm({ group, userId }: { group: GroupDetail; userId: string }) {
  const theme = useTheme();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(
    group.members.some((member) => member.id === userId) ? userId : (group.members[0]?.id ?? ''),
  );
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group.members.map((member) => member.id)));
  const [exact, setExact] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(group.members.map((member) => [member.id, '1'])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalCents = parseCents(amount);
  const selectedIds = group.members.filter((member) => selected.has(member.id)).map((member) => member.id);

  let previewError: string | null = null;
  let preview: { userId: string; amountCents: number }[] = [];
  if (splitType === 'equal' && totalCents && selectedIds.length > 0) {
    preview = splitEqual(totalCents, selectedIds);
  }
  if (splitType === 'shares' && totalCents && selectedIds.length > 0) {
    try {
      preview = splitShares(
        totalCents,
        selectedIds.map((id) => ({ userId: id, shares: Number(shares[id]) })),
      );
    } catch (caught) {
      previewError = caught instanceof SplitError ? caught.message : 'Check the shares.';
    }
  }

  const exactValues = selectedIds.map((id) => parseCentsAllowZero(exact[id] ?? ''));
  const exactInvalid = exactValues.some((value) => value == null);
  const exactTotal = exactValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const remaining = totalCents == null ? null : totalCents - exactTotal;

  async function onSave() {
    if (!description.trim()) {
      setError('Add a description.');
      return;
    }
    if (!totalCents) {
      setError('Enter an amount greater than 0, with up to 2 decimal places.');
      return;
    }
    if (!payerId) {
      setError('Choose who paid.');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Choose at least one person.');
      return;
    }
    if (splitType === 'exact') {
      if (exactInvalid) {
        setError('Enter each exact amount with up to 2 decimal places.');
        return;
      }
      if (remaining !== 0) {
        setError('Exact amounts must sum to the total.');
        return;
      }
    }
    if (splitType === 'shares' && previewError) {
      setError(previewError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.addExpense(userId, group.id, {
        description: description.trim(),
        amount_cents: totalCents,
        payer_id: payerId,
        split_type: splitType,
        participants: selectedIds.map((id) => {
          if (splitType === 'exact') return { user_id: id, amount_cents: parseCentsAllowZero(exact[id] ?? '') ?? 0 };
          if (splitType === 'shares') return { user_id: id, shares: Number(shares[id]) };
          return { user_id: id };
        }),
      });
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the expense.');
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Field label="Description" value={description} onChangeText={setDescription} placeholder="Dinner" maxLength={80} />
      <Field
        label={`Amount (${group.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <Choice
        label="Paid by"
        value={payerId}
        onChange={setPayerId}
        options={group.members.map((member) => ({
          value: member.id,
          label: member.id === userId ? `${member.display_name} (you)` : member.display_name,
        }))}
      />
      <Choice
        label="Split"
        value={splitType}
        onChange={setSplitType}
        options={[
          { value: 'equal', label: 'Equal' },
          { value: 'exact', label: 'Exact' },
          { value: 'shares', label: 'Shares' },
        ]}
      />

      <ThemedText type="small" themeColor="textSecondary">
        Who is included
      </ThemedText>
      {group.members.map((member) => {
        const included = selected.has(member.id);
        const previewAmount = preview.find((item) => item.userId === member.id)?.amountCents;
        return (
          <Card key={member.id}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: included }}
              onPress={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(member.id)) next.delete(member.id);
                  else next.add(member.id);
                  return next;
                })
              }
              style={styles.member}>
              <View style={[styles.check, { backgroundColor: included ? theme.accent : theme.backgroundSelected }]} />
              <ThemedText style={styles.name}>
                {member.id === userId ? `${member.display_name} (you)` : member.display_name}
              </ThemedText>
              {included && previewAmount != null ? (
                <ThemedText type="smallBold">{formatMoney(previewAmount, group.currency)}</ThemedText>
              ) : null}
            </Pressable>
            {included && splitType === 'exact' ? (
              <Field
                label="Exact amount"
                value={exact[member.id] ?? ''}
                onChangeText={(value) => setExact((current) => ({ ...current, [member.id]: value }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            ) : null}
            {included && splitType === 'shares' ? (
              <Field
                label="Shares"
                value={shares[member.id] ?? '1'}
                onChangeText={(value) =>
                  setShares((current) => ({ ...current, [member.id]: value.replace(/[^0-9]/g, '').slice(0, 4) }))
                }
                keyboardType="number-pad"
              />
            ) : null}
          </Card>
        );
      })}

      {splitType === 'exact' && totalCents != null && remaining != null ? (
        <ThemedText themeColor={remaining === 0 ? 'positive' : 'negative'}>
          {remaining === 0
            ? 'Amounts match the total.'
            : `${formatMoney(Math.abs(remaining), group.currency)} ${remaining > 0 ? 'left to assign' : 'over the total'}`}
        </ThemedText>
      ) : null}
      {previewError ? <ErrorText>{previewError}</ErrorText> : null}
      <ErrorText>{error}</ErrorText>
      <Button label={saving ? 'Saving…' : 'Save expense'} disabled={saving} onPress={onSave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 6,
  },
  name: {
    flex: 1,
  },
});
