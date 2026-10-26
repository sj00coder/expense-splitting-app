import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ErrorText, Field } from '@/components/form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/context/session';
import { ApiError } from '@/lib/api';

export default function ProfileScreen() {
  const { displayName, saveName } = useSession();
  const [name, setName] = useState(displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveName(name);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen tab>
      <View style={styles.header}>
        <ThemedText type="subtitle">Profile</ThemedText>
        <ThemedText themeColor="textSecondary">This name is what people in your groups see.</ThemedText>
      </View>
      <Card>
        <Field
          label="Display name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setSaved(false);
          }}
          placeholder="Alex"
          autoCorrect={false}
          maxLength={40}
        />
        <Button label={saving ? 'Saving…' : 'Save name'} disabled={saving || !name.trim()} onPress={onSave} />
        {saved ? <ThemedText themeColor="positive">Name saved.</ThemedText> : null}
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
});
