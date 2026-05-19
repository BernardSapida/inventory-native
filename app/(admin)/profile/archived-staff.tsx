import { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useAppDialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { watchArchivedStaff, restoreStaff, deleteUser } from '@/lib/firebase/users';
import { AppUser } from '@/lib/types/user';
import { useColors, ColorPalette } from '@/lib/constants';
import { format } from 'date-fns';

export default function ArchivedStaff() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showConfirm } = useAppDialog();
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = watchArchivedStaff((data) => { setStaff(data); setIsLoading(false); });
    return unsub;
  }, []);

  async function handleRestore(s: AppUser) {
    showConfirm('Restore Staff', `Restore ${s.fullName} to active status?`, () => restoreStaff(s.uid), 'Restore');
  }

  async function handleDelete(s: AppUser) {
    showConfirm('Delete Permanently', `Permanently delete ${s.fullName}? This cannot be undone.`, () => deleteUser(s.uid), 'Delete');
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/profile')} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Archived Staff</Text>
        <View style={{ width: 28 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(s) => s.uid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="archive" size={40} color={C.border} />
              <Text style={styles.emptyText}>No archived staff</Text>
            </View>
          }
          renderItem={({ item: s }) => (
            <View style={styles.card}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarText}>{s.fullName[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.fullName}</Text>
                <Text style={styles.email}>{s.email}</Text>
                {s.archivedAt && (
                  <Text style={styles.archivedDate}>
                    Archived {format(s.archivedAt, 'MMM d, yyyy')}
                  </Text>
                )}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => handleRestore(s)} style={[styles.actionBtn, { borderColor: C.success + '60' }]}>
                  <Feather name="user-check" size={16} color={C.success} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(s)} style={[styles.actionBtn, { borderColor: C.danger + '60' }]}>
                  <Feather name="trash-2" size={16} color={C.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { color: C.textSec, fontSize: 14 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 12 },
    avatarSmall: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: C.textSec, fontSize: 18, fontWeight: '700' },
    name: { color: C.text, fontSize: 15, fontWeight: '600' },
    email: { color: C.textSec, fontSize: 12, marginTop: 2 },
    archivedDate: { color: C.danger, fontSize: 11, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  });
}
