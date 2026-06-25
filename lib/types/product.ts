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

// display unit -> { base unit, factor to base }
const UNIT_TABLE: Record<string, { base: BaseUnit; factor: number }> = {
  mg: { base: "g", factor: 0.001 },
  g: { base: "g", factor: 1 },
  gram: { base: "g", factor: 1 },
  grams: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  L: { base: "ml", factor: 1000 },
  liter: { base: "ml", factor: 1000 },
  liters: { base: "ml", factor: 1000 },
  pcs: { base: "piece", factor: 1 },
  piece: { base: "piece", factor: 1 },
  pieces: { base: "piece", factor: 1 },
  bottle: { base: "piece", factor: 1 },
  bottles: { base: "piece", factor: 1 },
};

export function unitInfo(unit: string) {
  return (
    UNIT_TABLE[unit.trim().toLowerCase()] ?? {
      base: "piece" as BaseUnit,
      factor: 1,
    }
  );
}

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
