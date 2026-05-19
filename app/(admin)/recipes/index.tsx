import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppDialog } from '@/lib/dialog';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import {
  watchRecipes, addRecipe, updateRecipe, deleteRecipe,
} from '@/lib/firebase/recipes';
import { watchInventoryItems, adjustQuantity } from '@/lib/firebase/inventory';
import { RecipeModel, RecipeIngredient, RECIPE_CATEGORIES } from '@/lib/types/recipe';
import { FirestoreInventoryItem } from '@/lib/types/inventory';
import { useAuthStore } from '@/store/auth';
import { C, useColors, ColorPalette } from '@/lib/constants';
import { Toast } from '@/components/Toast';
import { EmptyState } from '@/components/EmptyState';

const UNIT_GROUPS: Record<string, string[]> = {
  weight: ['g', 'kg', 'oz', 'lb'],
  volume: ['ml', 'L', 'cup', 'tbsp', 'tsp'],
  count: ['pcs'],
};

const TO_BASE: Record<string, number> = {
  g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
  ml: 1, L: 1000, cup: 236.588, tbsp: 14.787, tsp: 4.929,
  pcs: 1,
};

function getUnitGroup(unit: string): string {
  for (const [group, units] of Object.entries(UNIT_GROUPS)) {
    if (units.includes(unit)) return group;
  }
  return 'unknown';
}

function getCompatibleUnits(unit: string): string[] {
  return UNIT_GROUPS[getUnitGroup(unit)] ?? [unit];
}

function convertToInventoryUnit(qty: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return qty;
  return (qty * (TO_BASE[fromUnit] ?? 1)) / (TO_BASE[toUnit] ?? 1);
}

function checkLocal(
  recipe: RecipeModel,
  invMap: Map<string, number>,
  times: number
): { available: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const ing of recipe.ingredients) {
    if ((invMap.get(ing.itemId) ?? 0) < ing.quantity * times) missing.push(ing.itemName);
  }
  return { available: missing.length === 0, missing };
}

export default function AdminRecipes() {
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert, showConfirm } = useAppDialog();
  const [recipes, setRecipes] = useState<RecipeModel[]>([]);
  const [invItems, setInvItems] = useState<FirestoreInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQ, setSearchQ] = useState('');

  const [selected, setSelected] = useState<RecipeModel | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<RecipeModel | null>(null);
  const [rName, setRName] = useState('');
  const [rCategory, setRCategory] = useState(RECIPE_CATEGORIES[0]);
  const [rServing, setRServing] = useState('1');
  const [rInstructions, setRInstructions] = useState('');
  const [rIngredients, setRIngredients] = useState<RecipeIngredient[]>([]);
  const [saving, setSaving] = useState(false);

  const [showIngModal, setShowIngModal] = useState(false);
  const [selItemId, setSelItemId] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingUnit, setIngUnit] = useState('pcs');

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    let loaded = 0;
    const check = () => { if (++loaded >= 2) setIsLoading(false); };
    const u1 = watchRecipes((d) => { setRecipes(d); check(); });
    const u2 = watchInventoryItems((d) => { setInvItems(d); check(); });
    return () => { u1(); u2(); };
  }, []);

  const invMap = new Map(invItems.map((i) => [i.id, i.quantity]));

  function handleSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQ(text), 300);
  }

  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(searchQ.toLowerCase()));

  function openAdd() {
    setEditTarget(null);
    setRName(''); setRCategory(RECIPE_CATEGORIES[0]); setRServing('1');
    setRInstructions(''); setRIngredients([]);
    setShowForm(true);
  }

  function openEdit(recipe: RecipeModel) {
    setEditTarget(recipe);
    setRName(recipe.name);
    setRCategory(recipe.category);
    setRServing(String(recipe.servingSize));
    setRInstructions(recipe.instructions);
    setRIngredients([...recipe.ingredients]);
    setShowForm(true);
    setSelected(null);
  }

  async function handleSave() {
    if (!rName.trim()) { showAlert('Required', 'Recipe name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: rName.trim(),
        category: rCategory,
        servingSize: parseInt(rServing) || 1,
        instructions: rInstructions,
        ingredients: rIngredients,
        createdBy: user?.fullName ?? '',
      };

      if (editTarget) {
        const netChanges = new Map<string, { invItem: FirestoreInventoryItem; delta: number }>();
        for (const old of editTarget.ingredients) {
          const invItem = invItems.find((i) => i.id === old.itemId);
          if (!invItem) continue;
          const restore = convertToInventoryUnit(old.quantity, old.unit, invItem.unit);
          const cur = netChanges.get(old.itemId);
          netChanges.set(old.itemId, { invItem, delta: (cur?.delta ?? 0) + restore });
        }
        for (const ing of rIngredients) {
          const invItem = invItems.find((i) => i.id === ing.itemId);
          if (!invItem) continue;
          const deduct = convertToInventoryUnit(ing.quantity, ing.unit, invItem.unit);
          const cur = netChanges.get(ing.itemId);
          netChanges.set(ing.itemId, { invItem, delta: (cur?.delta ?? 0) - deduct });
        }
        await updateRecipe(editTarget.id, payload);
        for (const [itemId, { invItem, delta }] of netChanges) {
          if (delta === 0) continue;
          const newQty = Math.max(0, invItem.quantity + delta);
          await adjustQuantity(itemId, invItem.name, newQty, 'recipe_update', user?.fullName ?? '', invItem.minimumThreshold);
        }
        showToast('Recipe updated');
      } else {
        await addRecipe(payload, user?.fullName ?? '');
        for (const ing of rIngredients) {
          const invItem = invItems.find((i) => i.id === ing.itemId);
          if (!invItem) continue;
          const deduct = convertToInventoryUnit(ing.quantity, ing.unit, invItem.unit);
          const newQty = Math.max(0, invItem.quantity - deduct);
          await adjustQuantity(invItem.id, invItem.name, newQty, 'recipe_ingredient', user?.fullName ?? '', invItem.minimumThreshold);
        }
        showToast('Recipe created');
      }
      setShowForm(false);
    } catch (e: unknown) {
      showAlert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRecipe(recipe: RecipeModel) {
    showConfirm('Delete Recipe', `Remove "${recipe.name}"?`, async () => {
      await deleteRecipe(recipe.id);
      setSelected(null);
      showToast('Recipe deleted', 'info');
    }, 'Delete');
  }

  function addIngredient() {
    if (!selItemId) { showAlert('Select an item'); return; }
    const qty = parseFloat(ingQty);
    if (isNaN(qty) || qty <= 0) { showAlert('Invalid', 'Enter a valid quantity.'); return; }
    const item = invItems.find((i) => i.id === selItemId);
    if (!item) return;

    if (getUnitGroup(ingUnit) !== getUnitGroup(item.unit)) {
      showAlert('Incompatible units', `Cannot use ${ingUnit} for an item stored in ${item.unit}.`);
      return;
    }

    const already = rIngredients.findIndex((i) => i.itemId === selItemId);
    if (already >= 0) {
      const updated = [...rIngredients];
      updated[already] = { ...updated[already], quantity: updated[already].quantity + qty, unit: ingUnit };
      setRIngredients(updated);
    } else {
      setRIngredients((prev) => [...prev, { itemId: item.id, itemName: item.name, quantity: qty, unit: ingUnit }]);
    }
    setShowIngModal(false);
    setSelItemId(''); setIngQty(''); setIngUnit('');
  }

  function availBadge(recipe: RecipeModel) {
    if (recipe.ingredients.length === 0) return null;
    return checkLocal(recipe, invMap, 1).available;
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recipes</Text>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={palette.textSec} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
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

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon="book-open" title="No recipes yet" subtitle="Tap + to create your first recipe" />
          }
          renderItem={({ item }) => {
            const avail = availBadge(item);
            return (
              <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recipeName}>{item.name}</Text>
                  <Text style={styles.recipeMeta}>
                    {item.category} · Serves {item.servingSize} · {item.ingredients.length} ingredient{item.ingredients.length !== 1 ? 's' : ''}
                  </Text>
                  {avail !== null && (
                    <View style={[styles.availBadge, { backgroundColor: avail ? C.successSoft : C.dangerSoft }]}>
                      <Feather name={avail ? 'check-circle' : 'alert-triangle'} size={11} color={avail ? C.success : C.danger} />
                      <Text style={[styles.availText, { color: avail ? C.success : C.danger }]}>
                        {avail ? 'Ready to prepare' : 'Insufficient stock'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity onPress={() => openEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="edit-2" size={15} color={palette.textSec} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteRecipe(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="trash-2" size={15} color={C.danger} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ── Recipe Detail Modal ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selected?.name}</Text>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => selected && openEdit(selected)}>
                  <Feather name="edit-2" size={18} color={palette.textSec} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selected && handleDeleteRecipe(selected)}>
                  <Feather name="trash-2" size={18} color={C.danger} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color={palette.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.metaRow}>
                <Tag label={selected?.category ?? ''} palette={palette} />
                <Tag label={`Serves ${selected?.servingSize}`} palette={palette} />
                <Tag label={`${selected?.ingredients.length ?? 0} ingredient${(selected?.ingredients.length ?? 0) !== 1 ? 's' : ''}`} palette={palette} />
              </View>

              <Text style={styles.fieldLabel}>INGREDIENTS</Text>
              {selected?.ingredients.length === 0 ? (
                <Text style={styles.emptySmall}>No ingredients listed.</Text>
              ) : (
                selected?.ingredients.map((ing, idx) => (
                  <View key={`${ing.itemId}-${idx}`} style={styles.ingRow}>
                    <Feather name="circle" size={6} color={palette.textSec} style={{ marginTop: 5 }} />
                    <Text style={styles.ingText}>{ing.itemName} — {ing.quantity} {ing.unit}</Text>
                  </View>
                ))
              )}

              {selected?.instructions ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>INSTRUCTIONS</Text>
                  <Text style={styles.instructions}>{selected.instructions}</Text>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add / Edit Recipe Modal ── */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editTarget ? 'Edit Recipe' : 'New Recipe'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <FieldLabel palette={palette}>Recipe Name</FieldLabel>
              <TextInput style={styles.formInput} value={rName} onChangeText={setRName} placeholder="e.g. Pasta Carbonara" placeholderTextColor={palette.textSec} />

              <FieldLabel palette={palette}>Category</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {RECIPE_CATEGORIES.map((c) => (
                    <TouchableOpacity key={c} style={[styles.chip, rCategory === c && styles.chipActive]} onPress={() => setRCategory(c)}>
                      <Text style={[styles.chipText, rCategory === c && { color: C.brand }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <FieldLabel palette={palette}>Serving Size</FieldLabel>
              <TextInput style={styles.formInput} value={rServing} onChangeText={setRServing} keyboardType="numeric" placeholder="1" placeholderTextColor={palette.textSec} />

              <FieldLabel palette={palette}>Instructions (optional)</FieldLabel>
              <TextInput
                style={[styles.formInput, { height: 90, textAlignVertical: 'top', paddingTop: 10, marginBottom: 14 }]}
                value={rInstructions}
                onChangeText={setRInstructions}
                placeholder="Step-by-step instructions..."
                placeholderTextColor={palette.textSec}
                multiline
              />

              <View style={styles.ingHeader}>
                <FieldLabel palette={palette}>Ingredients</FieldLabel>
                <TouchableOpacity onPress={() => { setSelItemId(''); setIngQty(''); setIngUnit('pcs'); setShowIngModal(true); }} style={styles.addIngBtn}>
                  <Feather name="plus" size={14} color={C.brand} />
                  <Text style={styles.addIngText}>Add</Text>
                </TouchableOpacity>
              </View>
              {rIngredients.length === 0 ? (
                <Text style={styles.emptySmall}>No ingredients added yet.</Text>
              ) : (
                rIngredients.map((ing, idx) => (
                  <View key={`${ing.itemId}-${idx}`} style={styles.ingEditRow}>
                    <Feather name="circle" size={6} color={palette.textSec} style={{ marginTop: 5 }} />
                    <Text style={[styles.ingText, { flex: 1 }]}>{ing.itemName} — {ing.quantity} {ing.unit}</Text>
                    <TouchableOpacity onPress={() => setRIngredients((p) => p.filter((_, i) => i !== idx))}>
                      <Feather name="x" size={14} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <TouchableOpacity style={[styles.saveBtn, { marginTop: 20 }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" /> : <Text style={styles.saveBtnText}>{editTarget ? 'Save Changes' : 'Create Recipe'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Ingredient Sub-Modal ── */}
      <Modal visible={showIngModal} transparent animationType="slide" onRequestClose={() => setShowIngModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Ingredient</Text>
              <TouchableOpacity onPress={() => setShowIngModal(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>SELECT ITEM</Text>
            <FlatList
              data={invItems}
              keyExtractor={(i) => i.id}
              style={{ maxHeight: 160, marginBottom: 14 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.invItem, selItemId === item.id && { borderColor: C.brand, backgroundColor: C.brandSoft }]}
                  onPress={() => { setSelItemId(item.id); setIngUnit(item.unit); }}
                >
                  <Text style={{ color: selItemId === item.id ? C.brand : palette.text, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: palette.textSec, fontSize: 12 }}>{item.quantity} {item.unit} available</Text>
                </TouchableOpacity>
              )}
            />

            <Text style={styles.fieldLabel}>QUANTITY NEEDED</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 14 }]}
              value={ingQty}
              onChangeText={setIngQty}
              keyboardType="numeric"
              placeholder="e.g. 2"
              placeholderTextColor={palette.textSec}
            />

            {selItemId ? (
              <>
                <Text style={styles.fieldLabel}>UNIT</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {getCompatibleUnits(invItems.find((i) => i.id === selItemId)?.unit ?? 'pcs').map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.chip, ingUnit === u && styles.chipActive]}
                        onPress={() => setIngUnit(u)}
                      >
                        <Text style={[styles.chipText, ingUnit === u && { color: C.brand }]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : <View style={{ marginBottom: 20 }} />}

            <TouchableOpacity style={styles.saveBtn} onPress={addIngredient}>
              <Text style={styles.saveBtnText}>Add Ingredient</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          visible
          onHide={() => setToast(null)}
        />
      )}
    </View>
  );
}

function FieldLabel({ children, palette }: { children: React.ReactNode; palette: ColorPalette }) {
  return <Text style={{ color: palette.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{children}</Text>;
}

function Tag({ label, palette }: { label: string; palette: ColorPalette }) {
  return (
    <View style={{ backgroundColor: palette.surfaceAlt, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: palette.border }}>
      <Text style={{ color: palette.textSec, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    searchInput: { flex: 1, color: C.text, fontSize: 15 },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
    recipeName: { color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 3 },
    recipeMeta: { color: C.textSec, fontSize: 12 },
    availBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    availText: { fontSize: 11, fontWeight: '700' },
    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', elevation: 6 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '88%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: '700', flex: 1 },
    fieldLabel: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    emptySmall: { color: C.textSec, fontSize: 13, marginBottom: 8 },
    ingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    ingEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 10 },
    ingText: { color: C.text, fontSize: 14 },
    instructions: { color: C.textSec, fontSize: 13, lineHeight: 20 },
    ingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    addIngBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    addIngText: { color: C.brand, fontSize: 13, fontWeight: '600' },
    chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
    chipActive: { backgroundColor: C.brandSoft, borderColor: C.brand },
    chipText: { color: C.textSec, fontSize: 13, fontWeight: '600' },
    formInput: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15, marginBottom: 14 },
    saveBtn: { backgroundColor: C.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    invItem: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 6 },
  });
}
