import { useMemo, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import ScreenHeader from '@/components/ScreenHeader';
import { useAppDialog } from '@/lib/dialog';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { watchInspections, addInspection } from '@/lib/firebase/inspections';
import { InspectionModel, InspectionCondition } from '@/lib/types/inspection';
import { useAuthStore } from '@/store/auth';
import { C, useColors, ColorPalette } from '@/lib/constants';
import { format } from 'date-fns';

const CONDITIONS: { value: InspectionCondition; label: string; color: string }[] = [
  { value: 'good', label: 'Good', color: C.success },
  { value: 'warning', label: 'Warning', color: C.warning },
  { value: 'damaged', label: 'Damaged', color: C.danger },
  { value: 'expired', label: 'Expired', color: C.textSec },
];

export default function StaffInspection() {
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert } = useAppDialog();
  const [inspections, setInspections] = useState<InspectionModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [itemName, setItemName] = useState('');
  const [condition, setCondition] = useState<InspectionCondition>('good');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = watchInspections((d) => { setInspections(d); setIsLoading(false); });
    return unsub;
  }, []);

  async function handleSubmit() {
    if (!itemName.trim()) { showAlert('Required', 'Please enter the item name.'); return; }
    setSaving(true);
    try {
      await addInspection(itemName.trim(), condition, notes.trim(), user?.uid ?? '', user?.fullName ?? 'Staff');
      setShowAdd(false);
      setItemName(''); setCondition('good'); setNotes('');
      showAlert('Submitted', 'Inspection report submitted successfully.');
    } catch (e: unknown) {
      showAlert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function conditionColor(c: InspectionCondition) {
    return CONDITIONS.find((d) => d.value === c)?.color ?? palette.textSec;
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Inspections" />

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={inspections}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="clipboard" size={40} color={palette.border} />
              <Text style={styles.emptyText}>No inspections yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { borderLeftColor: conditionColor(item.condition), borderLeftWidth: 3 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.itemName}</Text>
                <Text style={styles.meta}>
                  By {item.staffName ?? 'Unknown'}{item.checkedAt ? ` · ${format(item.checkedAt, 'MMM d, h:mm a')}` : ''}
                </Text>
                {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
              </View>
              <View style={[styles.conditionBadge, { backgroundColor: conditionColor(item.condition) + '22' }]}>
                <Text style={[styles.conditionText, { color: conditionColor(item.condition) }]}>
                  {item.condition.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Submit Inspection Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Inspection</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Item Name</Text>
              <TextInput
                style={[styles.formInput, { marginBottom: 16 }]}
                value={itemName}
                onChangeText={setItemName}
                placeholder="e.g. Fresh Tomatoes"
                placeholderTextColor={palette.textSec}
              />

              <Text style={styles.fieldLabel}>Condition</Text>
              <View style={styles.conditionRow}>
                {CONDITIONS.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.conditionBtn, condition === c.value && { borderColor: c.color, backgroundColor: c.color + '22' }]}
                    onPress={() => setCondition(c.value)}
                  >
                    <Feather name={c.value === 'good' ? 'check-circle' : c.value === 'warning' ? 'alert-triangle' : c.value === 'expired' ? 'clock' : 'x-circle'} size={16} color={condition === c.value ? c.color : palette.textSec} />
                    <Text style={[styles.conditionBtnText, condition === c.value && { color: c.color }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 10, marginBottom: 20 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional notes..."
                placeholderTextColor={palette.textSec}
                multiline
              />

              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
                {saving ? <Spinner size="sm" /> : <Text style={styles.saveBtnText}>Submit Report</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { color: C.textSec, fontSize: 14 },
    card: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemName: { color: C.text, fontSize: 15, fontWeight: '600' },
    meta: { color: C.textSec, fontSize: 12, marginTop: 2 },
    notes: { color: C.textSec, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
    conditionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    conditionText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', elevation: 6 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    fieldLabel: { color: C.textSec, fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.4 },
    formInput: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15 },
    conditionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    conditionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.surfaceAlt, borderRadius: 10, paddingVertical: 12, borderWidth: 1.5, borderColor: C.border },
    conditionBtnText: { color: C.textSec, fontSize: 13, fontWeight: '600' },
    saveBtn: { backgroundColor: C.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
