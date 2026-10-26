import { Platform } from 'react-native';

import { api } from '@/lib/api';

export async function shareGroupHistory(userId: string, groupId: string, groupName: string) {
  const csv = await api.exportCsv(userId, groupId);
  const filename = `${slug(groupName)}-history.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new FileSystem.File(FileSystem.Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export history',
    UTI: 'public.comma-separated-values-text',
  });
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}
