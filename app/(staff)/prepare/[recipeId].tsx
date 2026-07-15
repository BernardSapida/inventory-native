import { Toast } from "@/components/Toast";
import { C, ColorPalette, useColors } from "@/lib/constants";
import { useAppDialog } from "@/lib/dialog";
import {
  recordPreparation,
  watchInventory,
  watchUsedStock,
} from "@/lib/firebase/products";
import { watchRecipes } from "@/lib/firebase/recipes";
import { buildIngredientStatuses, computeMaxServings } from "@/lib/recipe-math";
import { ProductWithBatches, UsedStock, unitInfo } from "@/lib/types/product";
import { RecipeModel } from "@/lib/types/recipe";
import { useAuthStore } from "@/store/auth";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

function fmtBase(amount: number, unit: string): string {
  const base = unitInfo(unit).base;
  if (base === "ml") {
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)} L`;
    return `${Number.isInteger(amount) ? amount : amount.toFixed(1)} ml`;
  }
  if (base === "g") {
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)} kg`;
    return `${Math.round(amount)} g`;
  }
  return `${Math.round(amount)} pcs`;
}

// "Need" is shown in the recipe's OWN declared unit (tbsp, tsp, pcs...) so it
// matches what the admin typed on the web, instead of the product's base unit.
// Trim float noise (0.30000001 -> 0.3) without forcing trailing zeros.
function fmtRecipeQty(qty: number, unit: string): string {
  return `${Math.round(qty * 1000) / 1000} ${unit}`;
}

export default function PrepareRecipeScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  // `prepare` is a hidden tab wrapping the [recipeId] route, so its internal
  // stack accumulates each recipe visited. router.back() would pop to the
  // previous recipe in that stack instead of the list - always exit to recipes.
  const goBackToRecipes = useCallback(() => {
    router.replace("/(staff)/recipes");
  }, [router]);
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert, showConfirm } = useAppDialog();

  const [recipes, setRecipes] = useState<RecipeModel[]>([]);
  const [products, setProducts] = useState<ProductWithBatches[]>([]);
  const [usedStock, setUsedStock] = useState<UsedStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [servings, setServings] = useState(1);
  const [preparing, setPreparing] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error" | "info";
  } | null>(null);

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

  const recipe = useMemo(
    () => recipes.find((r) => r.id === recipeId) ?? null,
    [recipes, recipeId],
  );
  const maxServings = useMemo(
    () => (recipe ? computeMaxServings(recipe, products, usedStock) : 0),
    [recipe, products, usedStock],
  );

  useEffect(() => {
    if (maxServings > 0 && servings > maxServings) setServings(maxServings);
  }, [maxServings]);

  const ingStatuses = useMemo(
    () =>
      recipe
        ? buildIngredientStatuses(recipe, servings, products, usedStock)
        : [],
    [recipe, servings, products, usedStock],
  );

  const anyShort = ingStatuses.some((i) => i.short);

  const handlePrepare = useCallback(() => {
    if (!recipe || !user) return;
    if (anyShort) {
      showAlert(
        "Insufficient Stock",
        "Some ingredients are short. Reduce servings.",
      );
      return;
    }
    showConfirm(
      "Confirm Preparation",
      `Prepare "${recipe.name}" × ${servings} serving${servings !== 1 ? "s" : ""}? This will deduct inventory immediately.`,
      async () => {
        setPreparing(true);
        try {
          await recordPreparation({
            recipe,
            servings,
            products,
            usedStock,
            preparedBy: user.uid ?? user.fullName,
            preparedByName: user.fullName,
            preparedByRole: user.role,
          });
          setToast({ msg: "Preparation recorded!", type: "success" });
          setTimeout(goBackToRecipes, 1500);
        } catch (e: unknown) {
          showAlert("Error", (e as Error).message);
        } finally {
          setPreparing(false);
        }
      },
      "Prepare",
    );
  }, [recipe, user, servings, products, usedStock, anyShort]);

  if (isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.root, styles.center]}>
        <Feather name="alert-circle" size={40} color={C.danger} />
        <Text style={[styles.notFound]}>Recipe not found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={goBackToRecipes}>
          <Text style={{ color: C.brand, fontWeight: "600" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackToRecipes} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text style={styles.headerSub}>{recipe.category}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Servings stepper */}
        <View style={styles.servingsCard}>
          <Text style={styles.servingsLabel}>SERVINGS TO PREPARE</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, servings <= 1 && { opacity: 0.4 }]}
              disabled={servings <= 1}
              onPress={() => setServings((s) => Math.max(1, s - 1))}
            >
              <Feather name="minus" size={20} color={C.brand} />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{servings}</Text>
            <TouchableOpacity
              style={[
                styles.stepBtn,
                servings >= maxServings && { opacity: 0.4 },
              ]}
              disabled={servings >= maxServings}
              onPress={() => setServings((s) => Math.min(maxServings, s + 1))}
            >
              <Feather name="plus" size={20} color={C.brand} />
            </TouchableOpacity>
          </View>
          <Text style={styles.peopleNote}>
            Good for {servings * recipe.servingSize}{" "}
            {servings * recipe.servingSize === 1 ? "person" : "people"}
          </Text>
          <Text style={styles.maxNote}>
            {maxServings > 0
              ? `Max: ${maxServings} servings`
              : "Cannot cook - insufficient stock"}
          </Text>
        </View>

        {/* Ingredient checklist */}
        <Text style={styles.sectionTitle}>INGREDIENTS</Text>
        {ingStatuses.map((ing, idx) => (
          <View
            key={idx}
            style={[styles.ingCard, ing.short && styles.ingCardShort]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.ingName}>{ing.name}</Text>
              <Text style={styles.ingDetail}>
                Need: {fmtRecipeQty(ing.perServing * servings, ing.unit)} ·
                Have: {fmtBase(ing.haveBase, ing.baseUnit)}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: ing.short ? C.dangerSoft : C.successSoft },
              ]}
            >
              <Feather
                name={ing.short ? "alert-triangle" : "check"}
                size={14}
                color={ing.short ? C.danger : C.success}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: ing.short ? C.danger : C.success },
                ]}
              >
                {ing.short ? "Short" : "OK"}
              </Text>
            </View>
          </View>
        ))}

        {recipe.instructions ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              INSTRUCTIONS
            </Text>
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsText}>{recipe.instructions}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.prepareBtn,
            (anyShort || maxServings === 0 || preparing) && { opacity: 0.45 },
          ]}
          disabled={anyShort || maxServings === 0 || preparing}
          onPress={handlePrepare}
        >
          {preparing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="play-circle" size={20} color="#fff" />
              <Text style={styles.prepareBtnText}>
                {anyShort
                  ? "Insufficient Stock"
                  : `Confirm Preparation (×${servings})`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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

function makeStyles(palette: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    center: { justifyContent: "center", alignItems: "center", gap: 16 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: palette.surface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: palette.border,
    },
    headerTitle: { color: palette.text, fontSize: 18, fontWeight: "700" },
    headerSub: { color: palette.textSec, fontSize: 12, marginTop: 1 },
    content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
    servingsCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: "center",
      marginBottom: 24,
    },
    servingsLabel: {
      color: palette.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginBottom: 16,
    },
    stepper: { flexDirection: "row", alignItems: "center", gap: 28 },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: palette.surfaceAlt,
      borderWidth: 1,
      borderColor: palette.border,
      justifyContent: "center",
      alignItems: "center",
    },
    stepValue: {
      color: palette.text,
      fontSize: 36,
      fontWeight: "700",
      minWidth: 48,
      textAlign: "center",
    },
    peopleNote: {
      color: C.brand,
      fontSize: 14,
      fontWeight: "700",
      marginTop: 14,
    },
    maxNote: { color: palette.textSec, fontSize: 12, marginTop: 6 },
    sectionTitle: {
      color: palette.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    ingCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    ingCardShort: { borderColor: C.danger, backgroundColor: C.dangerSoft },
    ingName: { color: palette.text, fontSize: 14, fontWeight: "600" },
    ingDetail: { color: palette.textSec, fontSize: 12, marginTop: 2 },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
    },
    statusText: { fontSize: 12, fontWeight: "700" },
    instructionsCard: {
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
    },
    instructionsText: { color: palette.textSec, fontSize: 13, lineHeight: 21 },
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingBottom: 16,
      paddingTop: 16,
      backgroundColor: palette.bg,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    prepareBtn: {
      backgroundColor: C.brand,
      borderRadius: 14,
      height: 54,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
    },
    prepareBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    notFound: { color: palette.text, fontSize: 16, fontWeight: "600" },
    backBtn: { marginTop: 8 },
  });
}
