import { useMemo, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { useAppDialog } from '@/lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { watchRecipes, updateRecipe, deleteRecipe } from '@/lib/firebase/recipes';
import { watchInventoryItems, adjustQuantity } from '@/lib/firebase/inventory';
import { RecipeModel, RecipeIngredient } from '@/lib/types/recipe';
import { FirestoreInventoryItem } from '@/lib/types/inventory';
import { useAuthStore } from '@/store/auth';
import { useColors, ColorPalette } from '@/lib/constants';

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
  const group = getUnitGroup(unit);
  return UNIT_GROUPS[group] ?? [unit];
}

function convertToInventoryUnit(qty: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return qty;
  const baseQty = qty * (TO_BASE[fromUnit] ?? 1);
  return baseQty / (TO_BASE[toUnit] ?? 1);
}

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showAlert, showConfirm } = useAppDialog();
  const [recipe, setRecipe] = useState<RecipeModel | null>(null);
  const [invItems, setInvItems] = useState<FirestoreInventoryItem[]>([]);
  const [showIngModal, setShowIngModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingUnit, setIngUnit] = useState('pcs');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub1 = watchRecipes((data) => setRecipe(data.find((r) => r.id === id) ?? null));
    const unsub2 = watchInventoryItems(setInvItems);
    return () => { unsub1(); unsub2(); };
  }, [id]);

  async function handleAddIngredient() {
    if (!selectedItemId) { showAlert('Select an item'); return; }
    const qty = parseFloat(ingQty);
    if (isNaN(qty) || qty <= 0) { showAlert('Invalid quantity'); return; }
    const invItem = invItems.find((i) => i.id === selectedItemId);
    if (!invItem || !recipe) return;

    if (getUnitGroup(ingUnit) !== getUnitGroup(invItem.unit)) {
      showAlert('Incompatible units', `Cannot use ${ingUnit} for an item stored in ${invItem.unit}.`);
      return;
    }

    const existing = recipe.ingredients.findIndex((i) => i.itemId === invItem.id);
    let currentInvQty = invItem.quantity;
    if (existing >= 0) {
      const old = recipe.ingredients[existing];
      currentInvQty += convertToInventoryUnit(old.quantity, old.unit, invItem.unit);
    }
    const deductAmt = convertToInventoryUnit(qty, ingUnit, invItem.unit);
    if (deductAmt > currentInvQty) {
      showAlert('Insufficient stock', `Only ${invItem.quantity} ${invItem.unit} of ${invItem.name} available.`);
      return;
    }

    const newIng: RecipeIngredient = { itemId: invItem.id, itemName: invItem.name, quantity: qty, unit: ingUnit };
    const updated: RecipeIngredient[] = existing >= 0
      ? recipe.ingredients.map((i, idx) => idx === existing ? newIng : i)
      : [...recipe.ingredients, newIng];

    setSaving(true);
    await updateRecipe(id, { ingredients: updated });
    await adjustQuantity(invItem.id, invItem.name, currentInvQty - deductAmt, 'recipe_ingredient', user?.fullName ?? 'admin', invItem.minimumThreshold);
    setSaving(false);
    setShowIngModal(false);
    setSelectedItemId(''); setIngQty(''); setIngUnit('');
  }

  async function handleRemoveIngredient(itemId: string) {
    if (!recipe) return;
    const ing = recipe.ingredients.find((i) => i.itemId === itemId);
    const updated = recipe.ingredients.filter((i) => i.itemId !== itemId);
    await updateRecipe(id, { ingredients: updated });
    if (ing) {
      const invItem = invItems.find((i) => i.id === itemId);
      if (invItem) {
        const restoreAmt = convertToInventoryUnit(ing.quantity, ing.unit, invItem.unit);
        await adjustQuantity(invItem.id, invItem.name, invItem.quantity + restoreAmt, 'recipe_ingredient_removed', user?.fullName ?? 'admin', invItem.minimumThreshold);
      }
    }
  }

  async function handleDelete() {
    if (!recipe) return;
    showConfirm('Delete Recipe', `Remove "${recipe.name}"?`, async () => {
      await deleteRecipe(recipe.id);
      router.canGoBack() ? router.back() : router.replace('/(admin)/recipes');
    }, 'Delete');
  }

  if (!recipe) {
    return <View style={styles.center}><Spinner size="lg" /></View>;
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/recipes')} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{recipe.name}</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Feather name="trash-2" size={20} color={C.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Meta */}
        <View style={styles.metaRow}>
          <Tag label={recipe.category} C={C} />
          <Tag label={`Serves ${recipe.servingSize}`} C={C} />
          <Tag label={`${recipe.ingredients.length} ingredient${recipe.ingredients.length !== 1 ? 's' : ''}`} C={C} />
        </View>

        {/* Instructions */}
        {recipe.instructions ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <Text style={styles.instructions}>{recipe.instructions}</Text>
          </View>
        ) : null}

        {/* Ingredients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <TouchableOpacity onPress={() => setShowIngModal(true)} style={styles.addIngBtn}>
              <Feather name="plus" size={14} color={C.brand} />
              <Text style={styles.addIngText}>Add</Text>
            </TouchableOpacity>
          </View>
          {recipe.ingredients.length === 0 ? (
            <Text style={styles.empty}>No ingredients added yet.</Text>
          ) : (
            recipe.ingredients.map((ing, idx) => (
              <View key={`${ing.itemId}-${idx}`} style={styles.ingRow}>
                <Feather name="circle" size={6} color={C.textSec} style={{ marginTop: 5 }} />
                <Text style={styles.ingText}>{ing.itemName} — {ing.quantity} {ing.unit}</Text>
                <TouchableOpacity onPress={() => handleRemoveIngredient(ing.itemId)}>
                  <Feather name="x" size={14} color={C.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Ingredient Modal */}
      <Modal visible={showIngModal} transparent animationType="slide" onRequestClose={() => setShowIngModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Ingredient</Text>
              <TouchableOpacity onPress={() => setShowIngModal(false)}>
                <Feather name="x" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Select Inventory Item</Text>
            <FlatList
              data={invItems}
              keyExtractor={(i) => i.id}
              style={{ maxHeight: 180, marginBottom: 14 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.invItem, selectedItemId === item.id && { borderColor: C.brand, backgroundColor: C.brandSoft }]}
                  onPress={() => { setSelectedItemId(item.id); setIngUnit(item.unit); }}
                >
                  <Text style={{ color: selectedItemId === item.id ? C.brand : C.text, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: C.textSec, fontSize: 12 }}>{item.quantity} {item.unit} available</Text>
                </TouchableOpacity>
              )}
            />
            <Text style={styles.fieldLabel}>Quantity Needed</Text>
            <TextInput style={[styles.formInput, { marginBottom: 14 }]} value={ingQty} onChangeText={setIngQty} keyboardType="numeric" placeholder="e.g. 2" placeholderTextColor={C.textSec} />
            {selectedItemId ? (
              <>
                <Text style={styles.fieldLabel}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {getCompatibleUnits(invItems.find((i) => i.id === selectedItemId)?.unit ?? 'pcs').map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.unitChip, ingUnit === u && styles.unitChipActive]}
                        onPress={() => setIngUnit(u)}
                      >
                        <Text style={[styles.unitChipText, ingUnit === u && { color: C.brand }]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : <View style={{ marginBottom: 20 }} />}
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleAddIngredient} disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Text style={styles.saveBtnText}>Add Ingredient</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Tag({ label, C }: { label: string; C: ColorPalette }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ color: C.textSec, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    backBtn: { padding: 4 },
    headerTitle: { flex: 1, color: C.text, fontSize: 18, fontWeight: '700', marginHorizontal: 16 },
    content: { padding: 20, paddingBottom: 40 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    section: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
    instructions: { color: C.textSec, fontSize: 14, lineHeight: 22 },
    addIngBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    addIngText: { color: C.brand, fontSize: 13, fontWeight: '600' },
    empty: { color: C.textSec, fontSize: 13 },
    ingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    ingText: { flex: 1, color: C.text, fontSize: 14 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    fieldLabel: { color: C.textSec, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.4 },
    invItem: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 6 },
    formInput: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15 },
    unitChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
    unitChipActive: { backgroundColor: C.brandSoft, borderColor: C.brand },
    unitChipText: { color: C.textSec, fontSize: 13, fontWeight: '600' },
    saveBtn: { backgroundColor: C.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
