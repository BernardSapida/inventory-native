import { EmptyState } from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { Toast } from "@/components/Toast";
import { C, ColorPalette, useColors } from "@/lib/constants";
import { useAppDialog } from "@/lib/dialog";
import { watchInventory, watchUsedStock } from "@/lib/firebase/products";
import {
  addRecipe,
  deleteRecipe,
  updateRecipe,
  watchRecipes,
} from "@/lib/firebase/recipes";
import { sanitizeDecimal, sanitizeInteger } from "@/lib/input";
import { computeMaxServings } from "@/lib/recipe-math";
import {
  ProductWithBatches,
  UsedStock,
  allowedUnitsForProduct,
} from "@/lib/types/product";
import {
  RECIPE_CATEGORIES,
  RecipeIngredient,
  RecipeModel,
} from "@/lib/types/recipe";
import { useAuthStore } from "@/store/auth";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Spinner } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";

const ALL_UNITS = ["pcs", "g", "kg", "ml", "L", "tbsp", "tsp", "cup"];

/**
 * Units offerable for an ingredient. Delegates to allowedUnitsForProduct, which
 * offers tbsp/tsp for a mass-stocked product once it has a density - this screen
 * used to hardcode `["g", "kg"]` for every gram product, so "1 tbsp sugar" was
 * literally not selectable.
 */
function getAllowedUnits(
  productName: string,
  products: ProductWithBatches[],
): string[] {
  if (!productName.trim()) return ALL_UNITS;
  const row = products.find(
    (r) =>
      r.product.name.trim().toLowerCase() === productName.trim().toLowerCase(),
  );
  if (!row) return ALL_UNITS;
  return allowedUnitsForProduct(row.product);
}

export default function AdminRecipes() {
  const router = useRouter();
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert, showConfirm } = useAppDialog();

  const [recipes, setRecipes] = useState<RecipeModel[]>([]);
  const [products, setProducts] = useState<ProductWithBatches[]>([]);
  const [usedStock, setUsedStock] = useState<UsedStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selected, setSelected] = useState<RecipeModel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<RecipeModel | null>(null);
  const [rName, setRName] = useState("");
  const [rCategory, setRCategory] = useState(RECIPE_CATEGORIES[0]);
  const [rServing, setRServing] = useState("1");
  const [rInstructions, setRInstructions] = useState("");
  const [rIngredients, setRIngredients] = useState<RecipeIngredient[]>([]);
  const [saving, setSaving] = useState(false);

  const [showIngModal, setShowIngModal] = useState(false);
  const [ingName, setIngName] = useState("");
  const [ingQty, setIngQty] = useState("");
  const [ingUnit, setIngUnit] = useState("pcs");
  const [ingSearch, setIngSearch] = useState("");

  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "success") => {
      setToast({ msg, type });
    },
    [],
  );

  useEffect(() => {
    let loaded = 0;
    const check = () => {
      if (++loaded >= 3) setIsLoading(false);
    };
    const u1 = watchRecipes((d) => {
      setRecipes(d);
      check();
    });
    const u2 = watchInventory((d) => {
      setProducts(d);
      check();
    });
    const u3 = watchUsedStock((d) => {
      setUsedStock(d);
      check();
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  function handleSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => setSearchQ(text.trim().toLowerCase()),
      300,
    );
  }

  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(searchQ),
  );

  function openAdd() {
    setEditTarget(null);
    setRName("");
    setRCategory(RECIPE_CATEGORIES[0]);
    setRServing("1");
    setRInstructions("");
    setRIngredients([]);
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
    if (!rName.trim()) {
      showAlert("Required", "Recipe name is required.");
      return;
    }
    if (!rInstructions.trim()) {
      showAlert("Required", "Instructions are required.");
      return;
    }
    if (rIngredients.length === 0) {
      showAlert("Required", "Add at least one ingredient.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: rName.trim(),
        category: rCategory,
        servingSize: parseInt(rServing) || 1,
        instructions: rInstructions,
        ingredients: rIngredients,
        createdBy: user?.fullName ?? "",
        updatedAt: new Date(),
      };
      if (editTarget) {
        await updateRecipe(editTarget.id, payload);
        showToast("Recipe updated");
      } else {
        await addRecipe(payload, user?.fullName ?? "");
        showToast("Recipe created");
      }
      setShowForm(false);
    } catch (e: unknown) {
      showAlert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRecipe(recipe: RecipeModel) {
    showConfirm(
      "Delete Recipe",
      `Remove "${recipe.name}"?`,
      async () => {
        await deleteRecipe(recipe.id);
        setSelected(null);
        showToast("Recipe deleted", "info");
      },
      "Delete",
    );
  }

  const productNames = useMemo(
    () => products.map((r) => r.product.name).sort(),
    [products],
  );

  const filteredProductNames = useMemo(() => {
    if (!ingSearch.trim()) return productNames;
    const q = ingSearch.trim().toLowerCase();
    return productNames.filter((n) => n.toLowerCase().includes(q));
  }, [productNames, ingSearch]);

  function addIngredient() {
    if (!ingName.trim()) {
      showAlert("Required", "Enter an ingredient name.");
      return;
    }
    const qty = parseFloat(ingQty);
    if (isNaN(qty) || qty <= 0) {
      showAlert("Invalid", "Enter a valid quantity per serving.");
      return;
    }

    const idx = rIngredients.findIndex(
      (i) => i.name.trim().toLowerCase() === ingName.trim().toLowerCase(),
    );
    if (idx >= 0) {
      const updated = [...rIngredients];
      updated[idx] = {
        name: ingName.trim(),
        quantityPerServing: qty,
        unit: ingUnit,
      };
      setRIngredients(updated);
    } else {
      setRIngredients((prev) => [
        ...prev,
        { name: ingName.trim(), quantityPerServing: qty, unit: ingUnit },
      ]);
    }
    setShowIngModal(false);
    setIngName("");
    setIngQty("");
    setIngUnit("pcs");
    setIngSearch("");
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Recipes" />

      <View style={styles.searchRow}>
        <Feather
          name="search"
          size={16}
          color={palette.textSec}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor={palette.textSec}
          value={search}
          onChangeText={handleSearch}
        />
        {search ? (
          <TouchableOpacity
            onPress={() => {
              setSearch("");
              setSearchQ("");
            }}
          >
            <Feather name="x" size={16} color={palette.textSec} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={
            filtered.length === 0 ? { flex: 1 } : styles.list
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="book-open"
              title="No recipes yet"
              subtitle="Tap + to create your first recipe"
            />
          }
          renderItem={({ item }) => {
            const maxServings = computeMaxServings(item, products, usedStock);
            const canCook = maxServings > 0;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setSelected(item)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recipeName}>{item.name}</Text>
                  <Text style={styles.recipeMeta}>
                    {item.category} · Serves {item.servingSize} ·{" "}
                    {item.ingredients.length} ingredient
                    {item.ingredients.length !== 1 ? "s" : ""}
                  </Text>
                  {item.ingredients.length > 0 && (
                    <View
                      style={[
                        styles.availBadge,
                        {
                          backgroundColor: canCook
                            ? C.successSoft
                            : C.dangerSoft,
                        },
                      ]}
                    >
                      <Feather
                        name={canCook ? "check-circle" : "alert-triangle"}
                        size={11}
                        color={canCook ? C.success : C.danger}
                      />
                      <Text
                        style={[
                          styles.availText,
                          { color: canCook ? C.success : C.danger },
                        ]}
                      >
                        {canCook
                          ? `Can cook ${maxServings} servings`
                          : "Cannot cook"}
                      </Text>
                    </View>
                  )}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => openEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="edit-2" size={15} color={palette.textSec} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteRecipe(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
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
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: "88%" }]}>
            {selected &&
              (() => {
                const maxServings = computeMaxServings(
                  selected,
                  products,
                  usedStock,
                );
                const canCook = maxServings > 0;
                return (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle} numberOfLines={1}>
                        {selected.name}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 16,
                          alignItems: "center",
                        }}
                      >
                        <TouchableOpacity onPress={() => openEdit(selected)}>
                          <Feather
                            name="edit-2"
                            size={18}
                            color={palette.textSec}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteRecipe(selected)}
                        >
                          <Feather name="trash-2" size={18} color={C.danger} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelected(null)}>
                          <Feather name="x" size={22} color={palette.text} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                      <View style={styles.metaRow}>
                        <Tag label={selected.category} palette={palette} />
                        <Tag
                          label={`Serves ${selected.servingSize}`}
                          palette={palette}
                        />
                        <Tag
                          label={`${selected.ingredients.length} ingredient${selected.ingredients.length !== 1 ? "s" : ""}`}
                          palette={palette}
                        />
                      </View>

                      <Text style={styles.fieldLabel}>INGREDIENTS</Text>
                      {selected.ingredients.length === 0 ? (
                        <Text style={styles.emptySmall}>
                          No ingredients listed.
                        </Text>
                      ) : (
                        selected.ingredients.map((ing, idx) => (
                          <View key={idx} style={styles.ingRow}>
                            <Feather
                              name="circle"
                              size={6}
                              color={palette.textSec}
                              style={{ marginTop: 5 }}
                            />
                            <Text style={styles.ingText}>
                              {ing.name} - {ing.quantityPerServing} {ing.unit}
                            </Text>
                          </View>
                        ))
                      )}

                      {selected.instructions ? (
                        <>
                          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                            INSTRUCTIONS
                          </Text>
                          <Text style={styles.instructions}>
                            {selected.instructions}
                          </Text>
                        </>
                      ) : null}

                      <TouchableOpacity
                        style={[
                          styles.prepareBtn,
                          !canCook && { opacity: 0.4 },
                        ]}
                        disabled={!canCook}
                        onPress={() => {
                          setSelected(null);
                          router.push(`/prepare/${selected.id}` as never);
                        }}
                      >
                        <Feather name="play-circle" size={18} color="#fff" />
                        <Text style={styles.prepareBtnText}>
                          {canCook
                            ? `Prepare - up to ${maxServings} servings`
                            : "Cannot cook (insufficient stock)"}
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </>
                );
              })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add / Edit Recipe Modal ── */}
      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: "92%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editTarget ? "Edit Recipe" : "New Recipe"}
              </Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.fieldLabel}>RECIPE NAME</Text>
              <TextInput
                style={styles.formInput}
                value={rName}
                onChangeText={setRName}
                placeholder="e.g. Adobong Manok"
                placeholderTextColor={palette.textSec}
              />

              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 14 }}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {RECIPE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        rCategory === cat && styles.chipActive,
                      ]}
                      onPress={() => setRCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          rCategory === cat && { color: C.brand },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.fieldLabel}>SERVING SIZE</Text>
              <TextInput
                style={styles.formInput}
                value={rServing}
                onChangeText={(t) => setRServing(sanitizeInteger(t))}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="1"
                placeholderTextColor={palette.textSec}
              />

              <Text style={styles.fieldLabel}>INSTRUCTIONS</Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    height: 90,
                    textAlignVertical: "top",
                    paddingTop: 10,
                    marginBottom: 14,
                  },
                ]}
                value={rInstructions}
                onChangeText={setRInstructions}
                placeholder="Step-by-step instructions..."
                placeholderTextColor={palette.textSec}
                multiline
              />

              <View style={styles.ingHeader}>
                <Text style={styles.fieldLabel}>INGREDIENTS</Text>
                <TouchableOpacity
                  onPress={() => {
                    setIngName("");
                    setIngQty("");
                    setIngUnit("pcs");
                    setIngSearch("");
                    setShowIngModal(true);
                  }}
                  style={styles.addIngBtn}
                >
                  <Feather name="plus" size={14} color={C.brand} />
                  <Text style={styles.addIngText}>Add</Text>
                </TouchableOpacity>
              </View>
              {rIngredients.length === 0 ? (
                <Text style={styles.emptySmall}>No ingredients added yet.</Text>
              ) : (
                rIngredients.map((ing, idx) => (
                  <View key={idx} style={styles.ingEditRow}>
                    <Feather
                      name="circle"
                      size={6}
                      color={palette.textSec}
                      style={{ marginTop: 5 }}
                    />
                    <Text style={[styles.ingText, { flex: 1 }]}>
                      {ing.name} - {ing.quantityPerServing} {ing.unit}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setRIngredients((p) => p.filter((_, i) => i !== idx))
                      }
                    >
                      <Feather name="x" size={14} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { marginTop: 20 },
                  saving && { opacity: 0.6 },
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Spinner size="sm" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editTarget ? "Save Changes" : "Create Recipe"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Ingredient Modal ── */}
      <Modal
        visible={showIngModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowIngModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: "88%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Ingredient</Text>
              <TouchableOpacity onPress={() => setShowIngModal(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>INGREDIENT NAME</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 6 }]}
              value={ingName}
              onChangeText={(t) => {
                setIngName(t);
                setIngSearch(t);
              }}
              placeholder="Type to search products..."
              placeholderTextColor={palette.textSec}
            />

            {ingSearch.trim().length > 0 && filteredProductNames.length > 0 && (
              <ScrollView
                style={{ maxHeight: 140, marginBottom: 10 }}
                showsVerticalScrollIndicator={false}
              >
                {filteredProductNames.slice(0, 6).map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={styles.suggestion}
                    onPress={() => {
                      setIngName(n);
                      setIngSearch("");
                      const allowed = getAllowedUnits(n, products);
                      if (!allowed.includes(ingUnit)) setIngUnit(allowed[0]);
                    }}
                  >
                    <Text style={{ color: palette.text, fontSize: 14 }}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={styles.fieldLabel}>QUANTITY PER SERVING</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 14 }]}
              value={ingQty}
              onChangeText={(t) => setIngQty(sanitizeDecimal(t))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="e.g. 300"
              placeholderTextColor={palette.textSec}
            />

            <Text style={styles.fieldLabel}>UNIT</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {getAllowedUnits(ingName, products).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, ingUnit === u && styles.chipActive]}
                  onPress={() => setIngUnit(u)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      ingUnit === u && { color: C.brand },
                    ]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

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

function Tag({ label, palette }: { label: string; palette: ColorPalette }) {
  return (
    <View
      style={{
        backgroundColor: palette.surfaceAlt,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.textSec, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surface,
      marginHorizontal: 20,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 44,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 15 },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    recipeName: {
      color: C.text,
      fontSize: 15,
      fontWeight: "600",
      marginBottom: 3,
    },
    recipeMeta: { color: C.textSec, fontSize: 12 },
    availBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 8,
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    availText: { fontSize: 11, fontWeight: "700" },
    fab: {
      position: "absolute",
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.brand,
      justifyContent: "center",
      alignItems: "center",
      elevation: 6,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    modalSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: "88%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: "700", flex: 1 },
    fieldLabel: {
      color: C.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    emptySmall: { color: C.textSec, fontSize: 13, marginBottom: 8 },
    ingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    ingEditRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
      backgroundColor: C.surfaceAlt,
      borderRadius: 10,
      padding: 10,
    },
    ingText: { color: C.text, fontSize: 14 },
    instructions: { color: C.textSec, fontSize: 13, lineHeight: 20 },
    ingHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    addIngBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    addIngText: { color: C.brand, fontSize: 13, fontWeight: "600" },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: C.surfaceAlt,
      borderWidth: 1,
      borderColor: C.border,
    },
    chipActive: { backgroundColor: C.brandSoft, borderColor: C.brand },
    chipText: { color: C.textSec, fontSize: 13, fontWeight: "600" },
    formInput: {
      backgroundColor: C.surfaceAlt,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      height: 44,
      color: C.text,
      fontSize: 15,
      marginBottom: 14,
    },
    saveBtn: {
      backgroundColor: C.brand,
      borderRadius: 12,
      height: 52,
      justifyContent: "center",
      alignItems: "center",
    },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    prepareBtn: {
      backgroundColor: C.brand,
      borderRadius: 14,
      height: 52,
      marginTop: 20,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
    },
    prepareBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    suggestion: {
      padding: 12,
      backgroundColor: C.surfaceAlt,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 4,
    },
  });
}
