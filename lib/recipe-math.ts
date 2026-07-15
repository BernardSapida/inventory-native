// Recipe availability math, shared by the staff and admin prepare screens.
//
// This lived as a copy-paste duplicate in both app/(staff)/prepare/[recipeId].tsx
// and app/(admin)/prepare/[recipeId].tsx. The two copies had already drifted, and
// a screen whose preview disagrees with what recordPreparation() actually writes
// is worse than no preview at all -- so there is exactly one copy now, and the
// write path in lib/firebase/products.ts uses the same toProductBase() call.

import {
  ProductWithBatches,
  UsedStock,
  effectiveBase,
  toBaseUnit,
  toProductBase,
} from "@/lib/types/product";
import { RecipeModel } from "@/lib/types/recipe";

export interface IngredientStatus {
  name: string;
  /** The recipe's unit (e.g. "tbsp") - what the ingredient was written in. */
  unit: string;
  /**
   * The product's stocking base unit ("g" | "ml" | "piece"), which `needed` and
   * `haveBase` are actually expressed in. Format those with THIS, not `unit`:
   * a recipe measured in tbsp is deducted from a mass-stocked product in grams,
   * so labelling the gram figure "ml" (tbsp's base) is wrong.
   */
  baseUnit: string;
  perServing: number;
  needed: number; // in the product's base unit
  haveBase: number;
  short: boolean;
  /** Units can't be reconciled (e.g. tbsp of a product with no density). */
  unitMismatch: boolean;
}

/** On-hand in the product's *consumption* base, counting opened bottles. */
function haveInBase(
  row: ProductWithBatches,
  usedById: Map<string, UsedStock>,
): number {
  const p = row.product;
  const isMeasurablePcs =
    p.measurable && p.baseUnit === "piece" && !!p.unitSize && !!p.usageUnit;
  if (!isMeasurablePcs) return row.onHand;

  const unitSizeBase = toBaseUnit(p.unitSize!, p.usageUnit!);
  const remaining = usedById.get(p.id)?.remainingBase ?? 0;
  return row.onHand * unitSizeBase + remaining;
}

export function buildIngredientStatuses(
  recipe: RecipeModel,
  servings: number,
  products: ProductWithBatches[],
  usedStock: UsedStock[],
): IngredientStatus[] {
  const byName = new Map(
    products.map((r) => [r.product.name.trim().toLowerCase(), r]),
  );
  const usedById = new Map(usedStock.map((u) => [u.id, u]));

  return recipe.ingredients.map((ing) => {
    const row = byName.get(ing.name.trim().toLowerCase());
    if (!row) {
      return {
        name: ing.name,
        unit: ing.unit,
        baseUnit: ing.unit, // no product to resolve a base from; qtys are 0 anyway
        perServing: ing.quantityPerServing,
        needed: 0,
        haveBase: 0,
        short: true,
        unitMismatch: false,
      };
    }

    // Density-aware: 1 tbsp sugar -> 12.5 g against a product stocked in kg.
    const converted = toProductBase(
      ing.quantityPerServing * servings,
      ing.unit,
      row.product,
    );
    const haveBase = haveInBase(row, usedById);
    const needed = converted ?? 0;

    return {
      name: ing.name,
      unit: ing.unit,
      baseUnit: effectiveBase(row.product),
      perServing: ing.quantityPerServing,
      needed,
      haveBase,
      // recordPreparation() skips unconvertible ingredients, so showing one as
      // "available" would silently under-deduct. Block the prep instead.
      short: converted == null || haveBase < needed,
      unitMismatch: converted == null,
    };
  });
}

export function computeMaxServings(
  recipe: RecipeModel,
  products: ProductWithBatches[],
  usedStock: UsedStock[],
): number {
  if (recipe.ingredients.length === 0) return 0;

  const byName = new Map(
    products.map((r) => [r.product.name.trim().toLowerCase(), r]),
  );
  const usedById = new Map(usedStock.map((u) => [u.id, u]));

  let max = Infinity;
  for (const ing of recipe.ingredients) {
    const row = byName.get(ing.name.trim().toLowerCase());
    if (!row) return 0;

    const perServing = toProductBase(
      ing.quantityPerServing,
      ing.unit,
      row.product,
    );
    if (perServing == null) return 0; // can't promise any servings
    if (perServing <= 0) continue; // blank qty = not a constraint

    max = Math.min(max, Math.floor(haveInBase(row, usedById) / perServing));
  }

  return max === Infinity ? 0 : max;
}
