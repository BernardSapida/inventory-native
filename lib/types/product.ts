// Batch/FEFO inventory model - SHARED with smartstock-admin and the backend.
// `products` = what an item is; `inventory_batches` = on-hand stock, each with
// its own (manually entered) expiry. On-hand = sum of batch quantities.

import type { Timestamp } from "firebase/firestore";

export type BaseUnit = "g" | "ml" | "piece";

export interface Product {
  id: string;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  displayUnit: string;
  minimumThreshold: number | null;
  shelfLifeDays: number | null;
  barcode: string;
  countable: boolean;
  // measurable=true → stored in pcs but used in ml/g (bottles, cans)
  measurable: boolean;
  unitSize: number | null;   // how many usageUnits per 1 displayUnit piece
  usageUnit: string | null;  // "ml" | "L" | "g" | "kg"
  // g per ml. Lets recipes measure a mass-stocked ingredient in tbsp/tsp
  // (1 tbsp sugar = 12.5 g). Null = unknown; spoon units are then refused
  // rather than silently mis-deducted.
  density: number | null;
}

// Remaining liquid/solid in opened units per product. Written by prep flow.
export interface UsedStock {
  id: string;            // = productId
  remainingBase: number; // ml or g remaining across all opened units
  updatedAt: string;     // ISO string
}

export interface InventoryBatch {
  id: string;
  productId: string;
  quantity: number; // in base unit
  expirationDate: Timestamp | null; // MANUAL entry
  receivedDate: Timestamp | null;
  location: string | null;
  source: string;
  addedBy: string;
}

export type StockStatus = "out" | "low" | "in";

export interface ProductWithBatches {
  product: Product;
  batches: InventoryBatch[];
  onHand: number;
  status: StockStatus;
  nearestExpiry: Timestamp | null;
}

export function deriveStatus(
  onHand: number,
  minimumThreshold: number | null,
): StockStatus {
  if (onHand <= 0) return "out";
  if (minimumThreshold != null && onHand <= minimumThreshold) return "low";
  return "in";
}

// ---------------------------------------------------------------------------
// Units
//
// MUST STAY IN SYNC with smartstock-admin's src/lib/units.ts. If the two tables
// disagree, the same recipe deducts different amounts on web and on mobile.
//
// SPOON UNITS AND DENSITY
// tbsp/tsp/cup measure VOLUME, but seasonings (sugar, salt, spices) are stocked
// by MASS. Crossing that boundary needs the ingredient's density in g/ml -- there
// is no universal factor, since a tbsp of salt (~17.7 g) and a tbsp of flour
// (~7.8 g) differ by more than 2x. Previously this table had no tbsp/tsp entries
// at all, so unitInfo("tbsp") fell through to {base:"piece", factor:1} and
// "1 tbsp sugar" silently deducted 1 g instead of 12.5 g.
// ---------------------------------------------------------------------------

// display unit -> { natural base unit, factor to that base }
const UNIT_TABLE: Record<string, { base: BaseUnit; factor: number }> = {
  mg: { base: "g", factor: 0.001 },
  g: { base: "g", factor: 1 },
  gram: { base: "g", factor: 1 },
  grams: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  liter: { base: "ml", factor: 1000 },
  liters: { base: "ml", factor: 1000 },
  tbsp: { base: "ml", factor: 14.787 },
  tablespoon: { base: "ml", factor: 14.787 },
  tsp: { base: "ml", factor: 4.929 },
  teaspoon: { base: "ml", factor: 4.929 },
  cup: { base: "ml", factor: 240 },
  oz: { base: "ml", factor: 29.574 },
  pcs: { base: "piece", factor: 1 },
  piece: { base: "piece", factor: 1 },
  pieces: { base: "piece", factor: 1 },
  bottle: { base: "piece", factor: 1 },
  bottles: { base: "piece", factor: 1 },
};

export const SPOON_UNITS = ["tbsp", "tsp", "cup"] as const;

export function unitInfo(unit: string) {
  return (
    UNIT_TABLE[unit.trim().toLowerCase()] ?? {
      base: "piece" as BaseUnit,
      factor: 1,
    }
  );
}

/** ml in one level tablespoon - pivot between the cook-facing "g per tbsp" an
 *  admin edits and the g/ml density the math uses. */
export const TBSP_ML = UNIT_TABLE.tbsp.factor;

/**
 * One row of the global spoon-conversion table: an ingredient-name keyword and
 * the weight of ONE level tablespoon of it, in grams. Stored in `system_config`
 * by the admin web and read here; density (g/ml) = gPerTbsp / TBSP_ML.
 * MUST match smartstock-admin's SpoonDefault (src/lib/units.ts).
 */
export interface SpoonDefault {
  name: string;
  gPerTbsp: number;
}

/**
 * Built-in seed, used until the admin's saved table arrives from Firestore.
 * Keep in sync with smartstock-admin's BUILTIN_SPOON_DEFAULTS. Order matters:
 * more specific names first ("brown sugar" before "sugar"), first match wins.
 * Sugar at 12.5 g/tbsp = 0.845 g/ml gives 1 tsp = 4.2 g.
 */
export const BUILTIN_SPOON_DEFAULTS: SpoonDefault[] = [
  { name: "brown sugar", gPerTbsp: 13.75 },
  { name: "powdered sugar", gPerTbsp: 8.3 },
  { name: "sugar", gPerTbsp: 12.5 },
  { name: "salt", gPerTbsp: 17.7 },
  { name: "baking soda", gPerTbsp: 13.3 },
  { name: "baking powder", gPerTbsp: 13.3 },
  { name: "cornstarch", gPerTbsp: 9.3 },
  { name: "flour", gPerTbsp: 7.8 },
  { name: "pepper", gPerTbsp: 7.4 },
  { name: "spice", gPerTbsp: 7.4 },
  { name: "seasoning", gPerTbsp: 7.4 },
  { name: "msg", gPerTbsp: 13.6 },
  { name: "rice", gPerTbsp: 12.6 },
  { name: "oil", gPerTbsp: 14.8 },
  { name: "vinegar", gPerTbsp: 14.8 },
  { name: "soy sauce", gPerTbsp: 14.8 },
  { name: "water", gPerTbsp: 14.8 },
  { name: "milk", gPerTbsp: 14.8 },
  { name: "honey", gPerTbsp: 21 },
  { name: "syrup", gPerTbsp: 21 },
  { name: "butter", gPerTbsp: 13.5 },
  { name: "margarine", gPerTbsp: 13.5 },
];

// Admin's saved table, pushed in from system_config at startup (see
// lib/firebase/settings.ts). Null = not loaded/empty -> built-in seed applies.
// Module-level because resolveDensity() is a hot synchronous call in recipe math.
let runtimeSpoonDefaults: SpoonDefault[] | null = null;

/** Point density resolution at the admin's saved table (or reset with null/empty). */
export function setSpoonDefaults(list: SpoonDefault[] | null): void {
  runtimeSpoonDefaults = list && list.length > 0 ? list : null;
}

/** The conversion table in force: the admin's if saved, else the built-in seed. */
export function activeSpoonDefaults(): SpoonDefault[] {
  return runtimeSpoonDefaults ?? BUILTIN_SPOON_DEFAULTS;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Density (g/ml) for a name from the active table: first whole-word match wins. */
function densityFromDefaults(name: string): number | null {
  const n = name.trim().toLowerCase();
  for (const d of activeSpoonDefaults()) {
    const kw = d.name.trim().toLowerCase();
    if (!kw) continue;
    if (new RegExp(`\\b${escapeRegExp(kw)}\\b`).test(n)) return d.gPerTbsp / TBSP_ML;
  }
  return null;
}

/**
 * Best-known density (g/ml). Three cases (keep in sync with admin units.ts):
 *   density > 0   → explicit value, use it.
 *   density === 0 → explicit OFF (spoon toggle unchecked); no spoons, no guess.
 *   density == null → never configured (legacy/seeded); guess via the global table.
 */
export function resolveDensity(p: Pick<Product, "name" | "density">): number | null {
  if (p.density != null) return p.density > 0 ? p.density : null;
  return densityFromDefaults(p.name);
}

export function suggestedDensity(name: string): number | null {
  return densityFromDefaults(name);
}

/** The unit a product is effectively consumed in (a bottle is used in ml). */
export function effectiveBase(p: Product): BaseUnit {
  if (p.measurable && p.baseUnit === "piece" && p.usageUnit && p.usageUnit !== "pcs" && p.unitSize) {
    return unitInfo(p.usageUnit).base;
  }
  return p.baseUnit;
}

/**
 * Convert `value` in `unit` into `targetBase`, using `density` (g/ml) to cross
 * the volume<->mass boundary. Returns null when the conversion is impossible --
 * a count mixed with a measure, or a spoon on a mass product of unknown density.
 * Callers MUST surface null as a unit mismatch, never coerce it to 0.
 */
export function convertToBase(
  value: number,
  unit: string,
  targetBase: BaseUnit,
  density: number | null,
): number | null {
  const { base: from, factor } = unitInfo(unit);
  const amount = value * factor;

  if (from === targetBase) return amount;
  if (from === "piece" || targetBase === "piece") return null;
  if (from === "ml" && targetBase === "g") return density && density > 0 ? amount * density : null;
  if (from === "g" && targetBase === "ml") return density && density > 0 ? amount / density : null;
  return null;
}

/**
 * Convert a recipe-ingredient quantity into the product's stocking base unit.
 * THE function recipe math and inventory deduction must call.
 */
export function toProductBase(value: number, unit: string, product: Product): number | null {
  return convertToBase(value, unit, effectiveBase(product), resolveDensity(product));
}

/** Units a recipe may use for this product (spoons only when convertible). */
export function allowedUnitsForProduct(p: Product): string[] {
  const base = effectiveBase(p);
  const own = p.measurable && p.usageUnit && p.usageUnit !== "pcs" ? p.usageUnit : p.displayUnit;
  const family: Record<BaseUnit, string[]> = {
    g: ["g", "kg"],
    ml: ["ml", "L", "oz"],
    piece: ["pcs"],
  };
  const units = [own, ...(family[base] ?? ["pcs"])];
  if (base === "ml" || (base === "g" && resolveDensity(p) != null)) units.push(...SPOON_UNITS);
  return Array.from(new Set(units));
}

/** Explain a spoon measure in the product's stocking unit, e.g. "1 tbsp = 12.5 g". */
export function explainConversion(value: number, unit: string, product: Product): string | null {
  const base = effectiveBase(product);
  if (unitInfo(unit).base === base) return null;
  const converted = toProductBase(value, unit, product);
  if (converted == null) return null;
  return `${value} ${unit} = ${Math.round(converted * 100) / 100} ${base}`;
}

/** Convert a value into its own unit's natural base (no density crossing). */
export function toBaseUnit(value: number, displayUnit: string): number {
  return value * unitInfo(displayUnit).factor;
}

export function fromBaseUnit(baseValue: number, displayUnit: string): number {
  const factor = unitInfo(displayUnit).factor || 1;
  return baseValue / factor;
}

export function formatQuantity(baseValue: number, displayUnit: string): string {
  const v = fromBaseUnit(baseValue, displayUnit);
  return `${Math.round(v * 1000) / 1000} ${displayUnit}`;
}
