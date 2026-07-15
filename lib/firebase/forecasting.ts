import { logger } from "@/lib/logger";
import { ForecastResult } from "@/lib/types/forecast";
import { type Product, toBaseUnit, toProductBase } from "@/lib/types/product";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./config";
import { errorMeta, newOperationId } from "./errors";

// Same window as the admin web forecast page so both apps agree.
const WINDOW_DAYS = 30;

interface ForecastIngredient {
  name: string;
  quantityPerServing: number;
  unit: string;
}

/**
 * Build the forecast from the SAME data the admin web uses:
 *   products + inventory_batches (on-hand) and the last 30 days of
 *   `preparations` -> recipes -> ingredients (consumption, base-unit aware).
 * Returns ingredients with tracked consumption, soonest-to-run-out first.
 */
export async function generateForecast(): Promise<ForecastResult[]> {
  const operationId = newOperationId();
  try {
    const [prodSnap, batchSnap, recipeSnap, prepSnap, usedSnap] =
      await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "inventory_batches")),
        getDocs(collection(db, "recipes")),
        getDocs(collection(db, "preparations")),
        getDocs(collection(db, "used_stock")),
      ]);

    // On-hand per product = sum of its batch quantities (already in base unit).
    const onHandByProduct = new Map<string, number>();
    batchSnap.forEach((d) => {
      const data = d.data();
      const pid = (data.productId as string) ?? "";
      onHandByProduct.set(
        pid,
        (onHandByProduct.get(pid) ?? 0) + Number(data.quantity ?? 0),
      );
    });

    // Remaining contents of opened units (ml/g) per product, keyed by productId.
    const usedByProduct = new Map<string, number>();
    usedSnap.forEach((d) => {
      usedByProduct.set(d.id, Number(d.data().remainingBase ?? 0));
    });

    // Recipes by id, with normalised ingredient fields (matches recipes.ts).
    const recipeById = new Map<string, ForecastIngredient[]>();
    recipeSnap.forEach((d) => {
      const data = d.data();
      const ingredients = ((data.ingredients as unknown[]) ?? []).map((i) => {
        const ing = i as Record<string, unknown>;
        return {
          name: (ing.name as string) ?? (ing.itemName as string) ?? "",
          quantityPerServing: Number(
            ing.quantityPerServing ?? ing.quantity ?? 0,
          ),
          unit: (ing.unit as string) ?? "pcs",
        };
      });
      recipeById.set(d.id, ingredients);
    });

    // Products by name, so consumption can be converted through the product's own
    // density: "1 tbsp sugar" is 12.5 g, not 1. Without the product in hand this
    // used a bare toBaseUnit(), which had no tbsp entry and silently counted a
    // tablespoon as 1 - understating consumption ~12x and skewing the forecast.
    const productByName = new Map<string, Product>();
    prodSnap.forEach((d) => {
      const data = d.data();
      const name = ((data.name as string) ?? "").trim().toLowerCase();
      if (!name) return;
      productByName.set(name, {
        id: d.id,
        name: (data.name as string) ?? "",
        category: (data.category as string) ?? "",
        baseUnit: ((data.baseUnit as string) ?? "piece") as Product["baseUnit"],
        displayUnit: (data.displayUnit as string) ?? "pcs",
        minimumThreshold: (data.minimumThreshold as number) ?? null,
        shelfLifeDays: (data.shelfLifeDays as number) ?? null,
        barcode: (data.barcode as string) ?? "",
        countable: (data.countable as boolean) ?? false,
        measurable: (data.measurable as boolean) ?? false,
        unitSize: (data.unitSize as number) ?? null,
        usageUnit: (data.usageUnit as string) ?? null,
        density: (data.density as number) ?? null,
      });
    });

    // Accumulate base-unit consumption per ingredient name over the window.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);
    cutoff.setHours(0, 0, 0, 0);

    const consumed = new Map<string, number>();
    prepSnap.forEach((d) => {
      const data = d.data();
      const dateStr = (data.date as string) ?? "";
      const prepDate = dateStr ? new Date(dateStr) : null;
      if (!prepDate || prepDate < cutoff) return;
      const ingredients = recipeById.get((data.recipeId as string) ?? "");
      if (!ingredients) return;
      const servings = Number(data.servings ?? 0);
      for (const ing of ingredients) {
        if (ing.quantityPerServing <= 0) continue;
        const key = ing.name.trim().toLowerCase();
        const product = productByName.get(key);
        if (!product) continue; // unmatched ingredient - nothing to forecast against
        // null = units can't be reconciled; skip rather than book a bogus figure.
        const base = toProductBase(
          ing.quantityPerServing * servings,
          ing.unit,
          product,
        );
        if (base == null) continue;
        consumed.set(key, (consumed.get(key) ?? 0) + base);
      }
    });

    // One row per product that has tracked consumption.
    const results: ForecastResult[] = [];
    prodSnap.forEach((d) => {
      const data = d.data();
      const name = (data.name as string) ?? "";
      const avgBase =
        (consumed.get(name.trim().toLowerCase()) ?? 0) / WINDOW_DAYS;
      if (avgBase <= 0) return; // admin filters out ingredients with no usage

      // For measurable pcs products (bottles/cans) the recipe consumes the
      // CONTENTS (ml/g), so on-hand pieces must be converted to the usage unit
      // before comparing - otherwise we'd divide pieces by ml. On-hand contents
      // = unopened pieces x unitSize + whatever remains in opened units.
      const baseUnit = (data.baseUnit as string) ?? "piece";
      const unitSize = data.unitSize as number | null;
      const usageUnit = data.usageUnit as string | null;
      const isMeasurable =
        !!data.measurable && baseUnit === "piece" && !!unitSize && !!usageUnit;

      const pieces = onHandByProduct.get(d.id) ?? 0;
      const displayUnit = isMeasurable
        ? (usageUnit as string)
        : ((data.displayUnit as string) ?? "pcs");
      const onHand = isMeasurable
        ? pieces * toBaseUnit(unitSize as number, usageUnit as string) +
          (usedByProduct.get(d.id) ?? 0)
        : pieces;

      results.push({
        id: d.id,
        name,
        category: (data.category as string) ?? "Uncategorized",
        displayUnit,
        onHand,
        avgPerDayBase: avgBase,
        daysLeft: avgBase > 0 ? Math.floor(onHand / avgBase) : null,
      });
    });

    const sorted = results.sort((a, b) => {
      if (a.daysLeft === null && b.daysLeft === null) return 0;
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

    logger.info({
      message: "Forecast generated",
      operationId,
      operation: "forecasting.generateForecast",
      itemCount: sorted.length,
    });
    return sorted;
  } catch (err: unknown) {
    logger.error({
      message: "Generate forecast failed",
      operationId,
      operation: "forecasting.generateForecast",
      ...errorMeta(err),
    });
    throw err;
  }
}
