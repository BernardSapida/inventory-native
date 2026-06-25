// Batch-model data layer for the native app - reads/writes the SAME
// `products` + `inventory_batches` collections as smartstock-admin, so mobile
// and web share one inventory. Mirrors the admin logic.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";
import {
  deriveStatus,
  type InventoryBatch,
  type Product,
  type ProductWithBatches,
  type UsedStock,
  toBaseUnit,
  unitInfo,
} from "@/lib/types/product";
import type { RecipeIngredient, RecipeModel } from "@/lib/types/recipe";

function toProduct(id: string, d: Record<string, unknown>): Product {
  return {
    id,
    name: (d.name as string) ?? "",
    category: (d.category as string) ?? "Uncategorized",
    baseUnit: ((d.baseUnit as string) ?? "piece") as Product["baseUnit"],
    displayUnit: (d.displayUnit as string) ?? "pcs",
    minimumThreshold: (d.minimumThreshold as number) ?? null,
    shelfLifeDays: (d.shelfLifeDays as number) ?? null,
    barcode: (d.barcode as string) ?? "",
    countable: (d.countable as boolean) ?? false,
    measurable: (d.measurable as boolean) ?? false,
    unitSize: (d.unitSize as number) ?? null,
    usageUnit: (d.usageUnit as string) ?? null,
  };
}

function toBatch(id: string, d: Record<string, unknown>): InventoryBatch {
  return {
    id,
    productId: (d.productId as string) ?? "",
    quantity: (d.quantity as number) ?? 0,
    expirationDate: (d.expirationDate as Timestamp) ?? null,
    receivedDate: (d.receivedDate as Timestamp) ?? null,
    location: (d.location as string) ?? null,
    source: (d.source as string) ?? "",
    addedBy: (d.addedBy as string) ?? "",
  };
}

function ms(ts: Timestamp | null): number {
  return ts ? ts.toMillis() : Number.POSITIVE_INFINITY;
}

function join(
  products: Product[],
  batches: InventoryBatch[],
): ProductWithBatches[] {
  const byProduct = new Map<string, InventoryBatch[]>();
  for (const b of batches) {
    const list = byProduct.get(b.productId) ?? [];
    list.push(b);
    byProduct.set(b.productId, list);
  }
  return products
    .map((product) => {
      const list = (byProduct.get(product.id) ?? []).sort(
        (a, b) => ms(a.expirationDate) - ms(b.expirationDate),
      );
      const onHand = list.reduce((s, b) => s + (b.quantity || 0), 0);
      return {
        product,
        batches: list,
        onHand,
        status: deriveStatus(onHand, product.minimumThreshold),
        nearestExpiry:
          list.find((b) => b.expirationDate)?.expirationDate ?? null,
      };
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
}

/** Live subscription to the joined inventory. Returns an unsubscribe fn. */
export function watchInventory(
  cb: (rows: ProductWithBatches[]) => void,
): () => void {
  let products: Product[] = [];
  let batches: InventoryBatch[] = [];
  let haveP = false;
  let haveB = false;
  const emit = () => {
    if (haveP && haveB) cb(join(products, batches));
  };
  const unsubP = onSnapshot(collection(db, "products"), (snap) => {
    products = snap.docs.map((d) => toProduct(d.id, d.data()));
    haveP = true;
    emit();
  });
  const unsubB = onSnapshot(collection(db, "inventory_batches"), (snap) => {
    batches = snap.docs.map((d) => toBatch(d.id, d.data()));
    haveB = true;
    emit();
  });
  return () => {
    unsubP();
    unsubB();
  };
}

/** Add a new batch (stock receiving). Expiry is MANUAL (pass a Date or null). */
export async function addBatch(args: {
  productId: string;
  displayUnit: string;
  quantityDisplay: number;
  expirationDate: Date | null;
  location?: string;
  addedBy: string;
  source?: "manual" | "scan";
}): Promise<string> {
  const ref = await addDoc(collection(db, "inventory_batches"), {
    productId: args.productId,
    quantity: toBaseUnit(args.quantityDisplay, args.displayUnit),
    expirationDate: args.expirationDate
      ? Timestamp.fromDate(args.expirationDate)
      : null,
    receivedDate: serverTimestamp(),
    location: args.location?.trim() || null,
    source: args.source ?? "manual",
    addedBy: args.addedBy,
  });
  return ref.id;
}

export async function updateBatchQuantity(
  batchId: string,
  newQtyDisplay: number,
  displayUnit: string,
): Promise<void> {
  await updateDoc(doc(db, "inventory_batches", batchId), {
    quantity: toBaseUnit(newQtyDisplay, displayUnit),
  });
}

/** Create a product (e.g. when a scanned item is not yet in the catalog). */
export async function ensureProduct(args: {
  name: string;
  category: string;
  displayUnit: string;
  shelfLifeDays?: number | null;
  barcode?: string;
}): Promise<string> {
  const { base } = unitInfo(args.displayUnit);
  const ref = await addDoc(collection(db, "products"), {
    name: args.name.trim(),
    category: args.category || "Uncategorized",
    baseUnit: base,
    displayUnit: args.displayUnit,
    minimumThreshold: null,
    shelfLifeDays: args.shelfLifeDays ?? null,
    barcode: args.barcode ?? "",
    countable: base === "piece",
    measurable: false,
    unitSize: null,
    usageUnit: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Create or update a product with all fields (from the product form). */
export async function saveProduct(
  args: {
    name: string;
    category: string;
    displayUnit: string;
    minimumThreshold: number | null;
    shelfLifeDays: number | null;
    measurable: boolean;
    unitSize: number | null;
    usageUnit: string | null;
  },
  existingId?: string,
): Promise<string> {
  const { base } = unitInfo(args.displayUnit);
  const isPcs = base === "piece";
  const data = {
    name: args.name.trim(),
    category: args.category || "Uncategorized",
    baseUnit: base,
    displayUnit: args.displayUnit,
    minimumThreshold:
      args.minimumThreshold != null
        ? toBaseUnit(args.minimumThreshold, args.displayUnit)
        : null,
    shelfLifeDays: args.shelfLifeDays ?? null,
    barcode: "",
    countable: isPcs,
    measurable: isPcs && args.measurable,
    unitSize: isPcs && args.measurable ? args.unitSize : null,
    usageUnit: isPcs && args.measurable ? args.usageUnit : null,
    updatedAt: serverTimestamp(),
  };
  if (existingId) {
    await updateDoc(doc(db, "products", existingId), data);
    return existingId;
  }
  const ref = await addDoc(collection(db, "products"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Live subscription to the used_stock collection. */
export function watchUsedStock(cb: (items: UsedStock[]) => void): () => void {
  return onSnapshot(collection(db, "used_stock"), (snap) => {
    const items = snap.docs.map((d) => {
      const raw = d.data();
      const ts = raw.updatedAt as Timestamp | undefined;
      return {
        id: d.id,
        remainingBase: (raw.remainingBase as number) ?? 0,
        updatedAt: ts?.toDate?.()?.toISOString?.() ?? "",
      };
    });
    cb(items);
  });
}

/**
 * Record a preparation: deducts inventory/used_stock per ingredient and writes
 * a preparations doc. All writes are in one Firestore batch (atomic).
 *
 * Ingredient deduction rules:
 *   A) Non-measurable pcs (egg, garlic) → deduct from inventory batches (FEFO)
 *   B) Measurable pcs (bottles/cans)    → drain used_stock first; open new
 *      bottles from inventory (FEFO) only when used_stock runs dry
 *   C) Weight/volume products (rice kg, flour g) → deduct from inventory (FEFO)
 */
export async function recordPreparation(args: {
  recipe: RecipeModel;
  servings: number;
  products: ProductWithBatches[];
  usedStock: UsedStock[];
  preparedBy: string;
  preparedByName: string;
  preparedByRole: string;
}): Promise<void> {
  const {
    recipe,
    servings,
    products,
    usedStock,
    preparedBy,
    preparedByName,
    preparedByRole,
  } = args;

  const productByName = new Map(
    products.map((r) => [r.product.name.trim().toLowerCase(), r]),
  );
  const usedStockById = new Map(usedStock.map((u) => [u.id, u]));

  // Collect write ops so we can commit everything atomically.
  type BatchOp =
    | { kind: "delete"; id: string }
    | { kind: "update_batch"; id: string; quantity: number }
    | { kind: "set_used_stock"; productId: string; remainingBase: number };

  const ops: BatchOp[] = [];

  for (const ing of recipe.ingredients) {
    const row = productByName.get(ing.name.trim().toLowerCase());
    if (!row) continue;

    const product = row.product;
    const required = toBaseUnit(ing.quantityPerServing * servings, ing.unit);
    if (required <= 0) continue;

    const isMeasurablePcs =
      product.measurable &&
      product.baseUnit === "piece" &&
      !!product.unitSize &&
      !!product.usageUnit;

    if (isMeasurablePcs) {
      // Case B: drain used_stock first, open bottles only when needed.
      const entry = usedStockById.get(product.id);
      let remaining = entry?.remainingBase ?? 0;
      const unitSizeBase = toBaseUnit(product.unitSize!, product.usageUnit!);

      if (remaining < required) {
        const deficit = required - remaining;
        const bottlesToOpen = Math.ceil(deficit / unitSizeBase);
        // Deduct bottlesToOpen pcs from inventory batches (FEFO).
        let toDeduct = bottlesToOpen;
        for (const b of row.batches) {
          if (toDeduct <= 0) break;
          const take = Math.min(b.quantity, toDeduct);
          toDeduct -= take;
          const left = b.quantity - take;
          ops.push(
            left <= 0
              ? { kind: "delete", id: b.id }
              : { kind: "update_batch", id: b.id, quantity: left },
          );
        }
        remaining += bottlesToOpen * unitSizeBase;
      }

      ops.push({
        kind: "set_used_stock",
        productId: product.id,
        remainingBase: Math.max(0, remaining - required),
      });
    } else {
      // Case A + C: deduct directly from inventory batches (FEFO).
      let toDeduct = required;
      for (const b of row.batches) {
        if (toDeduct <= 0) break;
        const take = Math.min(b.quantity, toDeduct);
        toDeduct -= take;
        const left = b.quantity - take;
        ops.push(
          left <= 0
            ? { kind: "delete", id: b.id }
            : { kind: "update_batch", id: b.id, quantity: left },
        );
      }
    }
  }

  const wb = writeBatch(db);

  for (const op of ops) {
    if (op.kind === "delete") {
      wb.delete(doc(db, "inventory_batches", op.id));
    } else if (op.kind === "update_batch") {
      wb.update(doc(db, "inventory_batches", op.id), {
        quantity: op.quantity,
      });
    } else {
      wb.set(
        doc(db, "used_stock", op.productId),
        { remainingBase: op.remainingBase, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
  }

  wb.set(doc(collection(db, "preparations")), {
    recipeId: recipe.id,
    recipeName: recipe.name,
    category: recipe.category,
    servings,
    preparedBy,
    preparedByName,
    preparedByRole,
    date: new Date().toISOString().slice(0, 10),
    preparedAt: serverTimestamp(),
  });

  await wb.commit();
}

export interface ConsumedPart {
  batchId: string;
  quantity: number;
}

/** FEFO deduction across a product's batches. */
export async function consumeProduct(
  productId: string,
  qtyBase: number,
): Promise<{ consumed: ConsumedPart[]; shortBy: number }> {
  if (qtyBase <= 0) return { consumed: [], shortBy: 0 };
  const snap = await getDocs(
    query(
      collection(db, "inventory_batches"),
      where("productId", "==", productId),
    ),
  );
  const batches = snap.docs
    .map((d) => ({
      id: d.id,
      ref: d.ref,
      quantity: (d.data().quantity as number) ?? 0,
      exp: d.data().expirationDate as Timestamp | null,
    }))
    .sort((a, b) => ms(a.exp) - ms(b.exp));
  const wb = writeBatch(db);
  const consumed: ConsumedPart[] = [];
  let remaining = qtyBase;
  for (const b of batches) {
    if (remaining <= 0) break;
    if (b.quantity <= 0) continue;
    const take = Math.min(b.quantity, remaining);
    remaining -= take;
    consumed.push({ batchId: b.id, quantity: take });
    const left = b.quantity - take;
    if (left <= 0) wb.delete(b.ref);
    else wb.update(b.ref, { quantity: left });
  }
  await wb.commit();
  return { consumed, shortBy: remaining > 0 ? remaining : 0 };
}

export async function deleteBatch(batchId: string): Promise<void> {
  await deleteDoc(doc(db, "inventory_batches", batchId));
}

export async function deleteProduct(productId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "inventory_batches"), where("productId", "==", productId)),
  );
  const wb = writeBatch(db);
  snap.docs.forEach((d) => wb.delete(d.ref));
  wb.delete(doc(db, "products", productId));
  await wb.commit();
}
