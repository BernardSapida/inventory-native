# Native App - Batch Model Reconciliation

> Status after autonomous run (2026-06-22): the **shared batch-model data layer
> is added and type-checks clean**. The existing screens still use the OLD flat
> `inventory` collection. This doc lists exactly what to change per screen so
> mobile uses the SAME `products` + `inventory_batches` as the web app.
>
> I did NOT blind-rewrite the large RN screens (e.g. 540-line recipes.tsx)
> because I can't run Expo here - that risks breaking your working app. The
> data layer below makes the screen swaps mechanical.

## Added (ready to use)
- `lib/types/product.ts` - Product / InventoryBatch / ProductWithBatches, unit
  conversion, status derivation (mirrors web).
- `lib/firebase/products.ts` - `watchInventory`, `addBatch` (manual expiry),
  `updateBatchQuantity`, `consumeProduct` (FEFO), `ensureProduct`, `deleteBatch`.

## Screen changes needed

### `app/(staff)/inventory.tsx`  ✅ DONE (rebuilt onto batch model, type-checks clean)
- Now uses `watchInventory` (products + batches): product cards with on-hand +
  status; tap → sheet with per-batch qty edit (`updateBatchQuantity`) + "Add batch"
  (manual `YYYY-MM-DD` expiry); header "+" → Add product (`ensureProduct` + first
  batch). Needs an Expo run to verify UI/runtime.

### `app/(admin)/inventory.tsx`  ⏳ TODO (mirror the staff screen above)
- Same swap as the staff screen; admin can also edit product details/threshold.

### `app/(staff)/recipes.tsx`  ⚠ has a bug to fix
- **BUG:** it currently deducts inventory when a recipe is CREATED/edited
  (≈ lines 170-179). Remove that - creating a recipe must NOT touch stock.
- Add a **Prepare** flow: pick servings → ingredient checklist (✓/✗ + have/need)
  → on confirm call `consumeProduct(productId, requiredBase * servings)` per
  ingredient (FEFO), then write a `preparations` doc (see web
  `recordPreparation` shape) - recipe, servings, who, when, consumed parts.
- Match recipe ingredients to products by NAME (legacy ingredient ids don't map
  to migrated product ids).

### `app/(staff)/inspection.tsx` (expiry checks)
- Read expiring batches from `watchInventory` (per-batch expiry) instead of the
  flat item list. Keep writing checks to `inspections` (existing) OR switch to
  the web `inventory_events` collection - pick ONE and use it on both apps.

### `app/camera.tsx` + scan flow (backend `/scan`)
- `/scan` returns `{ name, quantity, unit, category, shelf_life_days,
  expiry_date(suggested), boxes }`. On save:
  1. Find/create the product: `ensureProduct({ name, category, displayUnit: unit,
     shelfLifeDays })` (or match an existing product by name/barcode).
  2. `addBatch({ productId, displayUnit, quantityDisplay: quantity,
     expirationDate, source: 'scan', addedBy })` - **show the suggested expiry in
     an editable field; the user confirms/edits it** (scanner never finalizes
     expiry).

### Categories
- `lib/types/recipe.ts` still uses Breakfast/Lunch/Dinner. Switch to the standard
  set used on web: Appetizer, Soup, Salad, Main Course, Side Dish, Dessert,
  Beverage, Sauce/Condiment.

## Notes
- Old `lib/firebase/inventory.ts` (flat model) can stay until screens are moved,
  then be removed.
- After migration, the flat `inventory` collection is deprecated (web reads
  `products`/`inventory_batches`).
