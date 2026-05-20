import { useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { useAppDialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { watchActiveStaff, updatePermissions } from '@/lib/firebase/users';
import { AppUser } from '@/lib/types/user';
import { useColors, ColorPalette } from '@/lib/constants';

const PERMISSIONS = [
  { key: 'inventoryView', label: 'View Inventory' },
  { key: 'inventoryAdjust', label: 'Adjust Inventory' },
  { key: 'aiScanAccess', label: 'AI Scan Access' },
  { key: 'recipeView', label: 'View Recipes' },
  { key: 'recipeCreate', label: 'Create Recipes' },
  { key: 'recipeEdit', label: 'Edit Recipes' },
  { key: 'recipeDelete', label: 'Delete Recipes' },
  { key: 'recipePrepare', label: 'Prepare Recipes' },
  { key: 'inspectionSubmit', label: 'Submit Inspections' },
  { key: 'notificationsView', label: 'View Notifications' },
  { key: 'forecastView', label: 'View Forecasts' },
  { key: 'staffManage', label: 'Manage Staff' },
];

const PRESETS: Record<string, Record<string, boolean>> = {
  'Kitchen Staff': {
    inventoryView: true, inventoryAdjust: true, aiScanAccess: false,
    recipeView: true, recipeCreate: false, recipeEdit: false, recipeDelete: false, recipePrepare: true,
    inspectionSubmit: true, notificationsView: true, forecastView: false, staffManage: false,
  },
  'Stock Clerk': {
    inventoryView: true, inventoryAdjust: true, aiScanAccess: true,
    recipeView: true, recipeCreate: false, recipeEdit: false, recipeDelete: false, recipePrepare: false,
    inspectionSubmit: false, notificationsView: true, forecastView: false, staffManage: false,
  },
  Manager: {
    inventoryView: true, inventoryAdjust: true, aiScanAccess: true,
    recipeView: true, recipeCreate: true, recipeEdit: true, recipeDelete: true, recipePrepare: true,
    inspectionSubmit: true, notificationsView: true, forecastView: true, staffManage: true,
  },
};

export default function RolesPermissions() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showAlert } = useAppDialog();
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isDirty = useRef(false);

  useEffect(() => {
    const unsub = watchActiveStaff((data) => { setStaff(data); setIsLoading(false); });
    return unsub;
  }, []);

  // Keep selected + perms in sync with Firestore when not mid-edit
  useEffect(() => {
    if (!selected || isDirty.current) return;
    const updated = staff.find((s) => s.uid === selected.uid);
    if (updated) {
      setSelected(updated);
      setPerms({ ...updated.permissions });
    }
  }, [staff]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectStaff(s: AppUser) {
    isDirty.current = false;
    setSelected(s);
    setPerms({ ...s.permissions });
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await updatePermissions(selected.uid, perms);
      isDirty.current = false;
      showAlert('Saved', `Permissions updated for ${selected.fullName}.`);
    } catch {
      showAlert('Error', 'Failed to save permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(name: string) {
    isDirty.current = true;
    setPerms({ ...PRESETS[name] });
  }

  if (selected) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selected.fullName}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>PRESETS</Text>
          <View style={styles.presetRow}>
            {Object.keys(PRESETS).map((p) => (
              <TouchableOpacity key={p} style={styles.presetBtn} onPress={() => applyPreset(p)}>
                <Text style={styles.presetText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>PERMISSIONS</Text>
          {PERMISSIONS.map((perm) => (
            <View key={perm.key} style={styles.permRow}>
              <Text style={styles.permLabel}>{perm.label}</Text>
              <Switch
                value={perms[perm.key] ?? false}
                onValueChange={(v) => { isDirty.current = true; setPerms((p) => ({ ...p, [perm.key]: v })); }}
                trackColor={{ true: C.brand }}
                thumbColor="#fff"
              />
            </View>
          ))}

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <Text style={styles.saveBtnText}>Save Permissions</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/profile')} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Roles & Permissions</Text>
        <View style={{ width: 28 }} />
      </View>
      <Text style={[styles.sectionLabel, { paddingHorizontal: 20 }]}>SELECT STAFF MEMBER</Text>
      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(s) => s.uid}
          contentContainerStyle={styles.list}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={styles.staffCard} onPress={() => selectStaff(s)} activeOpacity={0.8}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarText}>{s.fullName[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{s.fullName}</Text>
                <Text style={styles.staffEmail}>{s.email}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.textSec} />
            </TouchableOpacity>
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
    sectionLabel: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    presetBtn: { backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
    presetText: { color: C.text, fontSize: 13, fontWeight: '600' },
    permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
    permLabel: { color: C.text, fontSize: 14 },
    saveBtn: { backgroundColor: C.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    staffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 12 },
    avatarSmall: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: C.brand, fontSize: 18, fontWeight: '700' },
    staffName: { color: C.text, fontSize: 15, fontWeight: '600' },
    staffEmail: { color: C.textSec, fontSize: 12, marginTop: 2 },
  });
}
