import { EmptyState } from '@/components/EmptyState';
import { Toast } from '@/components/Toast';
import { useColors, ColorPalette } from '@/lib/constants';
import { useAppDialog } from '@/lib/dialog';
import {
  addItem,
  deleteItem,
  updateItem,
  watchInventoryItems,
} from '@/lib/firebase/inventory';
import { FirestoreInventoryItem, ITEM_CATEGORIES, ITEM_UNITS, ItemCategory } from '@/lib/types/inventory';
import { useAuthStore } from '@/store/auth';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Spinner } from 'heroui-native';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type DisplayStatus = 'ok' | 'low' | 'out' | 'expiring';

type FormData = {
  name: string; category: ItemCategory; unit: string;
  quantity: string; minimumThreshold: string;
  expirationDate: string;
};

const EMPTY_FORM: FormData = {
  name: '', category: 'General', unit: 'pcs', quantity: '',
  minimumThreshold: '', expirationDate: '',
};

function getDisplayStatus(item: FirestoreInventoryItem): DisplayStatus {
  if (item.expirationDate) {
    const days = Math.ceil((item.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days <= 7 && days > 0) return 'expiring';
  }
  return item.status as DisplayStatus;
}

function parseDate(s: string): Date | undefined {
  const parts = s.split('/');
  if (parts.length !== 3) return undefined;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y || y < 2000) return undefined;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

export default function AdminInventory() {
  const router = useRouter();
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert, showConfirm } = useAppDialog();
  const [items, setItems] = useState<FirestoreInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<FirestoreInventoryItem | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    const unsub = watchInventoryItems((data) => {
      setItems(data);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  function handleSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQ(text), 300);
  }

  const filtered = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(searchQ.toLowerCase());
    const matchCat = activeCategory === 'All' || i.category === activeCategory;
    return matchSearch && matchCat;
  });

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(item: FirestoreInventoryItem) {
    setEditTarget(item);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: String(item.quantity),
      minimumThreshold: String(item.minimumThreshold),
      expirationDate: item.expirationDate ? format(item.expirationDate, 'MM/dd/yyyy') : '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { showAlert('Required', 'Item name is required.'); return; }
    const qty = parseFloat(form.quantity);
    const threshold = parseFloat(form.minimumThreshold);
    if (isNaN(qty) || qty < 0) { showAlert('Invalid', 'Quantity must be a valid number.'); return; }

    let expirationDate: Date | undefined;
    if (form.expirationDate.trim()) {
      expirationDate = parseDate(form.expirationDate.trim());
      if (!expirationDate) { showAlert('Invalid Date', 'Enter expiration date as MM/DD/YYYY.'); return; }
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        quantity: qty,
        minimumThreshold: isNaN(threshold) ? 0 : threshold,
        barcode: editTarget?.barcode ?? '',
        countable: editTarget?.countable ?? true,
        expirationDate,
        updatedBy: user?.fullName ?? 'admin',
      };

      if (editTarget) {
        await updateItem(editTarget.id, payload, user?.fullName ?? 'admin');
        showToast('Item updated');
      } else {
        await addItem(payload, user?.fullName ?? 'admin');
        showToast('Item added');
      }
      setShowModal(false);
    } catch (e: unknown) {
      showAlert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: FirestoreInventoryItem) {
    showConfirm(
      'Delete Item',
      `Remove "${item.name}" from inventory?`,
      async () => { await deleteItem(item.id); showToast(`"${item.name}" deleted`, 'info'); },
      'Delete',
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory</Text>
        <TouchableOpacity style={styles.cameraBtn} onPress={() => router.push('/camera')}>
          <Feather name="camera" size={20} color={palette.text} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={palette.textSec} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor={palette.textSec}
          value={search}
          onChangeText={handleSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => { setSearch(''); setSearchQ(''); }}>
            <Feather name="x" size={16} color={palette.textSec} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category filter */}
      <View style={styles.chipScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {['All', ...ITEM_CATEGORIES].map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, activeCategory === cat && styles.chipActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon="package" title="No items found" subtitle="Try a different search or category" />
          }
          renderItem={({ item }) => {
            const ds = getDisplayStatus(item);
            return (
              <TouchableOpacity style={styles.itemCard} onPress={() => openEdit(item)} activeOpacity={0.8}>
                {/* Left icon */}
                <View style={styles.itemIconWrap}>
                  <Feather name="package" size={20} color={palette.brand} />
                </View>
                {/* Center */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.category} · {item.unit}</Text>
                  {item.expirationDate && (
                    <Text style={styles.itemExpiry}>Expiry: {format(item.expirationDate, 'M/d/yyyy')}</Text>
                  )}
                </View>
                {/* Right: qty + status pill */}
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>{item.quantity} {item.unit}</Text>
                  <StatusPill status={ds} palette={palette} />
                </View>
                {/* Delete */}
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                >
                  <Feather name="trash-2" size={16} color={palette.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editTarget ? 'Edit Item' : 'Add Item'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <FormField label="Item Name" palette={palette}>
                <TextInput style={styles.formInput} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Tomatoes" placeholderTextColor={palette.textSec} />
              </FormField>

              <FormField label="Category" palette={palette}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {ITEM_CATEGORIES.map((c) => (
                      <TouchableOpacity key={c} style={[styles.chip, form.category === c && styles.chipActive]} onPress={() => setForm((f) => ({ ...f, category: c }))}>
                        <Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </FormField>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <FormField label="Quantity" palette={palette}>
                    <TextInput style={styles.formInput} value={form.quantity} onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={palette.textSec} />
                  </FormField>
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Unit" palette={palette}>
                    <TouchableOpacity
                      style={[styles.formInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                      onPress={() => setShowUnitPicker(true)}
                    >
                      <Text style={{ color: palette.text, fontSize: 15 }}>{form.unit}</Text>
                      <Feather name="chevron-down" size={16} color={palette.textSec} />
                    </TouchableOpacity>
                  </FormField>
                </View>
              </View>

              <FormField label="Minimum Threshold" palette={palette}>
                <TextInput style={styles.formInput} value={form.minimumThreshold} onChangeText={(v) => setForm((f) => ({ ...f, minimumThreshold: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={palette.textSec} />
              </FormField>

              <FormField label="Expiration Date (optional)" palette={palette}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.formInput, { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={{ color: form.expirationDate ? palette.text : palette.textSec, fontSize: 15 }}>
                      {form.expirationDate || 'Select date'}
                    </Text>
                    <Feather name="calendar" size={16} color={palette.textSec} />
                  </TouchableOpacity>
                  {form.expirationDate ? (
                    <TouchableOpacity onPress={() => setForm((f) => ({ ...f, expirationDate: '' }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="x-circle" size={20} color={palette.textSec} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </FormField>

              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" /> : <Text style={styles.saveBtnText}>{editTarget ? 'Save Changes' : 'Add Item'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Unit picker */}
      <Modal visible={showUnitPicker} transparent animationType="fade" onRequestClose={() => setShowUnitPicker(false)}>
        <TouchableOpacity style={styles.unitOverlay} activeOpacity={1} onPress={() => setShowUnitPicker(false)}>
          <View style={styles.unitSheet}>
            <Text style={styles.unitSheetTitle}>Select Unit</Text>
            {ITEM_UNITS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitOption, form.unit === u && styles.unitOptionActive]}
                onPress={() => { setForm((f) => ({ ...f, unit: u })); setShowUnitPicker(false); }}
              >
                <Text style={[styles.unitOptionText, form.unit === u && styles.unitOptionTextActive]}>{u}</Text>
                {form.unit === u && <Feather name="check" size={16} color={palette.brand} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date picker — Android shows native dialog, iOS shows slide-up sheet */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={form.expirationDate ? (parseDate(form.expirationDate) ?? new Date()) : new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) setForm((f) => ({ ...f, expirationDate: format(date, 'MM/dd/yyyy') }));
          }}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
            <View style={styles.dateSheet}>
              <View style={styles.dateSheetHeader}>
                <TouchableOpacity onPress={() => { setForm((f) => ({ ...f, expirationDate: '' })); setShowDatePicker(false); }}>
                  <Text style={styles.dateSheetClear}>Clear</Text>
                </TouchableOpacity>
                <Text style={styles.dateSheetTitle}>Expiration Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.dateSheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={form.expirationDate ? (parseDate(form.expirationDate) ?? new Date()) : new Date()}
                mode="date"
                display="spinner"
                onChange={(_, date) => {
                  if (date) setForm((f) => ({ ...f, expirationDate: format(date, 'MM/dd/yyyy') }));
                }}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}

      {toast && (
        <Toast message={toast.msg} type={toast.type} visible onHide={() => setToast(null)} />
      )}
    </View>
  );
}

function StatusPill({ status, palette }: { status: DisplayStatus; palette: ColorPalette }) {
  const config = {
    ok:       { label: 'IN STOCK',  color: palette.success, bg: palette.successSoft },
    low:      { label: 'LOW STOCK', color: palette.warning, bg: palette.warningSoft },
    out:      { label: 'OUT',       color: palette.danger,  bg: palette.dangerSoft  },
    expiring: { label: 'EXPIRING',  color: palette.info,    bg: palette.infoSoft    },
  }[status];
  return (
    <View style={{ backgroundColor: config.bg, borderRadius: 30, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: config.color, fontSize: 11, fontWeight: '700' }}>{config.label}</Text>
    </View>
  );
}

function FormField({ label, palette, children }: { label: string; palette: ColorPalette; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: palette.textSec, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.4 }}>{label}</Text>
      {children}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
    cameraBtn: { padding: 8, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
    searchInput: { flex: 1, color: C.text, fontSize: 15 },
    chipScroll: { height: 48, flexShrink: 0, marginBottom: 4, overflow: 'hidden' },
    chipRow: { paddingHorizontal: 20, alignItems: 'center', gap: 8, height: 48 },
    chip: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    chipActive: { backgroundColor: C.brandSoft, borderColor: C.brand },
    chipText: { color: C.textSec, fontSize: 13, fontWeight: '500' },
    chipTextActive: { color: C.brand, fontWeight: '700' },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 12 },
    itemIconWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    itemName: { color: C.text, fontSize: 15, fontWeight: '700' },
    itemMeta: { color: C.textSec, fontSize: 12, marginTop: 2 },
    itemExpiry: { color: C.textSec, fontSize: 11, marginTop: 2 },
    itemRight: { alignItems: 'flex-end', gap: 6 },
    itemQty: { color: C.text, fontSize: 16, fontWeight: '800' },
    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', elevation: 6 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    formInput: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15 },
    unitOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    unitSheet: { backgroundColor: C.surface, borderRadius: 16, paddingVertical: 8, width: 220, elevation: 8 },
    unitSheetTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 10 },
    unitOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginHorizontal: 4 },
    unitOptionActive: { backgroundColor: C.brandSoft },
    unitOptionText: { color: C.text, fontSize: 15 },
    unitOptionTextActive: { color: C.brand, fontWeight: '700' },
    saveBtn: { backgroundColor: C.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    dateSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
    dateSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    dateSheetTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    dateSheetClear: { color: C.textSec, fontSize: 15 },
    dateSheetDone: { color: C.brand, fontSize: 15, fontWeight: '700' },
  });
}
