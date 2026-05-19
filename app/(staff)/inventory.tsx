import { EmptyState } from '@/components/EmptyState';
import { Toast } from '@/components/Toast';
import { C, ColorPalette, useColors } from '@/lib/constants';
import { addItem, adjustQuantity, updateItem, watchInventoryItems } from '@/lib/firebase/inventory';
import {
  FirestoreInventoryItem,
  ITEM_CATEGORIES,
  ITEM_UNITS,
  ItemCategory,
} from '@/lib/types/inventory';
import { useAuthStore } from '@/store/auth';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spinner } from 'heroui-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAppDialog } from '@/lib/dialog';

type AdjMode = 'adjust' | 'stock_in' | 'stock_out';

const ADJ_MODES: { value: AdjMode; label: string }[] = [
  { value: 'adjust', label: 'Adjust' },
  { value: 'stock_in', label: 'Stock In' },
  { value: 'stock_out', label: 'Stock Out' },
];


function getStatusLabel(item: FirestoreInventoryItem): { label: string; color: string; bg: string } {
  if (item.status === 'out') return { label: 'Out of Stock', color: C.danger, bg: C.dangerSoft };
  if (item.status === 'low') return { label: 'Low Stock', color: C.warning, bg: C.warningSoft };
  return { label: 'In Stock', color: C.success, bg: C.successSoft };
}

export default function StaffInventory() {
  const router = useRouter();
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert } = useAppDialog();
  const [items, setItems] = useState<FirestoreInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');

  const [selected, setSelected] = useState<FirestoreInventoryItem | null>(null);
  const [adjMode, setAdjMode] = useState<AdjMode>('adjust');
  const [inputQty, setInputQty] = useState('');
  const [saving, setSaving] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [formItem, setFormItem] = useState<FirestoreInventoryItem | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    return watchInventoryItems((d) => { setItems(d); setIsLoading(false); });
  }, []);

  function handleSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQ(text.trim().toLowerCase()), 300);
  }

  const categories = ['All', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))];

  const filtered = items.filter((i) => {
    const q = searchQ;
    const matchSearch =
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.unit.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q);
    const matchCat = activeCategory === 'All' || i.category === activeCategory;
    return matchSearch && matchCat;
  });

  const availItems = filtered.filter((i) => i.quantity > 0);
  const outItems = filtered.filter((i) => i.quantity <= 0);

  function openAdjust(item: FirestoreInventoryItem) {
    setSelected(item);
    setAdjMode('adjust');
    setInputQty(String(item.quantity));
  }

  function openForm(item?: FirestoreInventoryItem) {
    setFormItem(item ?? null);
    setSelected(null);
    setFormVisible(true);
  }

  function computeNewQty(): number {
    const val = parseFloat(inputQty);
    if (isNaN(val) || val < 0) return -1;
    if (adjMode === 'adjust') return val;
    if (adjMode === 'stock_in') return (selected?.quantity ?? 0) + val;
    if (adjMode === 'stock_out') return Math.max(0, (selected?.quantity ?? 0) - val);
    return -1;
  }

  async function handleAdjust() {
    if (!selected) return;
    const newQty = computeNewQty();
    if (newQty < 0) { showAlert('Invalid', 'Enter a valid quantity (0 or more).'); return; }
    setSaving(true);
    try {
      await adjustQuantity(selected.id, selected.name, newQty, adjMode, user?.fullName ?? 'staff', selected.minimumThreshold);
      showToast('Stock updated successfully.');
      setSelected(null);
    } catch (e: unknown) {
      showAlert('Update failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openScanner() {
    router.push('/camera');
  }

  function renderStockCard(item: FirestoreInventoryItem) {
    const { label, color, bg } = getStatusLabel(item);
    return (
      <TouchableOpacity key={item.id} style={styles.stockCard} onPress={() => openAdjust(item)} activeOpacity={0.8}>
        <View style={styles.stockIconBox}>
          <Feather name="package" size={22} color={C.brand} />
        </View>
        <View style={styles.stockInfo}>
          <Text style={styles.stockName}>{item.name}</Text>
          <Text style={styles.stockMeta}>{item.category} • {item.unit}</Text>
        </View>
        <View style={styles.stockTrailing}>
          <Text style={styles.stockQty}>
            {Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)} {item.unit}
          </Text>
          <View style={{ height: 8 }} />
          <View style={[styles.statusPill, { backgroundColor: bg }]}>
            <Text style={[styles.statusText, { color }]}>{label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stock Management</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={openScanner}>
            <Feather name="camera" size={20} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => openForm()}>
            <Feather name="plus-square" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={palette.textSec} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search item"
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

      {/* ── Category Chips ── */}
      <View style={styles.chipScroll}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {categories.map((cat) => (
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

      {/* ── List ── */}
      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title={searchQ ? 'No matching inventory' : 'No inventory items yet'}
          subtitle={searchQ ? 'Try another search or change the selected category.' : 'Add items using the button above.'}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          style={{ flex: 1 }}
        >
          {availItems.map(renderStockCard)}
          {outItems.length > 0 && (
            <>
              <Text style={styles.outLabel}>Out of Stock</Text>
              {outItems.map(renderStockCard)}
            </>
          )}
        </ScrollView>
      )}

      {/* ── FABs ── */}
      <View style={styles.fabStack}>
        <TouchableOpacity style={styles.fab} onPress={() => openForm()} activeOpacity={0.85}>
          <Feather name="edit" size={16} color="#fff" />
          <Text style={styles.fabLabel}>Add Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fab, styles.fabSecondary]} onPress={openScanner} activeOpacity={0.85}>
          <Feather name="camera" size={16} color={C.brand} />
          <Text style={[styles.fabLabel, { color: C.brand }]}>Camera Scanner</Text>
        </TouchableOpacity>
      </View>

      {/* ── Adjustment Sheet ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setSelected(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selected?.name}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modeRow}>
              {ADJ_MODES.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeChip, adjMode === m.value && styles.modeChipActive]}
                  onPress={() => { setAdjMode(m.value); setInputQty(''); }}
                >
                  <Text style={[styles.modeChipText, adjMode === m.value && { color: C.brand }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.formInput}
              value={inputQty}
              onChangeText={setInputQty}
              keyboardType="numeric"
              placeholder={adjMode === 'adjust' ? 'New quantity' : 'Quantity'}
              placeholderTextColor={palette.textSec}
              autoFocus
            />

            <View style={styles.adjBtnRow}>
              <TouchableOpacity
                style={styles.outlinedBtn}
                onPress={() => openForm(selected ?? undefined)}
              >
                <Text style={styles.outlinedBtnText}>Edit details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filledBtn, saving && { opacity: 0.6 }]}
                onPress={handleAdjust}
                disabled={saving}
              >
                {saving ? <Spinner size="sm" /> : <Text style={styles.filledBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Item Form ── */}
      {formVisible && (
        <ItemFormModal
          item={formItem}
          performedBy={user?.fullName ?? 'staff'}
          onClose={() => setFormVisible(false)}
          onSaved={(msg) => { setFormVisible(false); showToast(msg); }}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} visible onHide={() => setToast(null)} />}
    </View>
  );
}

// ─────────────────────────────────────────
// Item Form Modal
// ─────────────────────────────────────────

function ItemFormModal({
  item,
  performedBy,
  onClose,
  onSaved,
}: {
  item: FirestoreInventoryItem | null;
  performedBy: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? 'General');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [unitOpen, setUnitOpen] = useState(false);
  const [qty, setQty] = useState(item ? String(item.quantity) : '');
  const [threshold, setThreshold] = useState(item ? String(item.minimumThreshold) : '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimName = name.trim();
    const parsedQty = parseFloat(qty);
    const parsedThreshold = parseFloat(threshold);
    if (!trimName || isNaN(parsedQty) || parsedQty < 0 || isNaN(parsedThreshold)) {
      showAlert('Validation', 'Please fill in all fields correctly.');
      return;
    }
    setSaving(true);
    try {
      if (!item) {
        await addItem(
          { name: trimName, category, unit, quantity: parsedQty, minimumThreshold: parsedThreshold, barcode: '', countable: false, updatedBy: performedBy },
          performedBy
        );
        onSaved('Item added successfully.');
      } else {
        await updateItem(
          item.id,
          { name: trimName, category, unit, quantity: parsedQty, minimumThreshold: parsedThreshold, barcode: item.barcode },
          performedBy
        );
        onSaved('Changes saved.');
      }
    } catch (e: unknown) {
      showAlert('Error', (e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {item ? `Edit ${item.name}` : 'Add stock item'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={palette.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>ITEM NAME</Text>
            <TextInput
              style={styles.formInput}
              value={name}
              onChangeText={setName}
              placeholder="Item name"
              placeholderTextColor={palette.textSec}
            />

            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <View style={styles.chipWrap}>
              {ITEM_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.formChip, category === cat && styles.formChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.formChipText, category === cat && { color: C.brand }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>QUANTITY</Text>
            <TextInput
              style={styles.formInput}
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={palette.textSec}
            />

            <Text style={styles.fieldLabel}>UNIT</Text>
            <TouchableOpacity
              style={[styles.formInput, styles.selectBox]}
              onPress={() => setUnitOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <Text style={styles.selectValue}>{unit}</Text>
              <Feather name={unitOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textSec} />
            </TouchableOpacity>
            {unitOpen && (
              <View style={styles.dropdown}>
                {ITEM_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.dropdownItem, u === unit && styles.dropdownItemActive]}
                    onPress={() => { setUnit(u); setUnitOpen(false); }}
                  >
                    <Text style={[styles.dropdownItemText, u === unit && { color: C.brand, fontWeight: '700' }]}>{u}</Text>
                    {u === unit && <Feather name="check" size={14} color={C.brand} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>THRESHOLD</Text>
            <TextInput
              style={styles.formInput}
              value={threshold}
              onChangeText={setThreshold}
              keyboardType="numeric"
              placeholder="Minimum threshold"
              placeholderTextColor={palette.textSec}
            />

            <View style={{ height: 16 }} />
            <TouchableOpacity
              style={[styles.filledBtn, { flex: undefined, width: '100%' }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <Spinner size="sm" /> : (
                <Text style={styles.filledBtnText}>
                  {item ? 'Save changes' : 'Save item'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    },
    headerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      justifyContent: 'center', alignItems: 'center',
    },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14,
      height: 44, borderWidth: 1, borderColor: C.border, marginBottom: 12,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 15 },

    chipScroll: { height: 48, flexShrink: 0, marginBottom: 4, overflow: 'hidden' },
    chipRow: { paddingHorizontal: 20, alignItems: 'center', gap: 8, height: 48 },
    chip: {
      flexShrink: 0, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    chipActive: { backgroundColor: C.brandSoft, borderColor: C.brand },
    chipText: { color: C.textSec, fontSize: 13, fontWeight: '500' },
    chipTextActive: { color: C.brand, fontWeight: '700' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { paddingHorizontal: 16, paddingBottom: 140 },

    stockCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 12,
    },
    stockIconBox: {
      width: 52, height: 52, borderRadius: 16,
      backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center',
    },
    stockInfo: { flex: 1, marginLeft: 14 },
    stockName: { color: C.text, fontSize: 16, fontWeight: '700' },
    stockMeta: { color: C.textSec, fontSize: 13, marginTop: 4 },
    stockTrailing: { alignItems: 'flex-end' },
    stockQty: { color: C.text, fontSize: 17, fontWeight: '800' },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },

    outLabel: { color: C.danger, fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4 },

    fabStack: { position: 'absolute', bottom: 24, right: 20, gap: 10, alignItems: 'flex-end' },
    fab: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.brand,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, gap: 8,
      elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    },
    fabSecondary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    fabLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { color: C.text, fontSize: 20, fontWeight: '700', flex: 1, marginRight: 12 },

    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    modeChip: {
      flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9,
      borderRadius: 20, backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: C.border,
    },
    modeChipActive: { borderColor: C.brand, backgroundColor: C.brandSoft },
    modeChipText: { color: C.textSec, fontSize: 13, fontWeight: '600' },

    formInput: {
      backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, height: 48, color: C.text, fontSize: 16, marginBottom: 16,
    },
    fieldLabel: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },

    adjBtnRow: { flexDirection: 'row', gap: 12 },
    outlinedBtn: {
      flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
      height: 48, justifyContent: 'center', alignItems: 'center',
    },
    outlinedBtnText: { color: C.text, fontSize: 15, fontWeight: '600' },
    filledBtn: {
      flex: 1, backgroundColor: C.brand, borderRadius: 12, height: 48,
      justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8,
    },
    filledBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    formChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border,
    },
    formChipActive: { borderColor: C.brand, backgroundColor: C.brandSoft },
    formChipText: { color: C.textSec, fontSize: 13, fontWeight: '500' },
    formRow: { flexDirection: 'row', alignItems: 'flex-start' },
    selectBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    selectValue: { color: C.text, fontSize: 16 },
    dropdown: {
      backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1,
      borderColor: C.border, marginTop: -12, marginBottom: 16, overflow: 'hidden',
    },
    dropdownItem: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    dropdownItemActive: { backgroundColor: C.brandSoft },
    dropdownItemText: { color: C.text, fontSize: 15 },
  });
}
