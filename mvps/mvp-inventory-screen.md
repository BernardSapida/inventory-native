# MVP: Inventory Screen (Mobile - Both Roles)

The current admin mobile inventory screen uses the OLD flat model (FirestoreInventoryItem).
It must be replaced with the batch/FEFO model (ProductWithBatches) that the staff screen already uses.

## Access
- Admin: `(admin)/inventory`
- Staff: `(staff)/inventory`

Both roles see the same screen and have the same capabilities. Admin also has product delete.

---

## Screen Layout

### Header
- Title: "Inventory"
- Subtitle: "X products"
- FAB or top-right button: "+ Add product"

### Chips / Summary
- Total products
- Low stock count (warning color)
- Out of stock count (danger color)

### Search + Category Filter
- Search bar: filter by product name
- Category dropdown / picker: All, Meat, Vegetables, Condiments, Dairy, Dry Goods, Fruits, Seafood

### Product List
Each row / card:
- Product name (bold)
- Category
- On-hand quantity (formatted: "2 pcs", "1.5 kg", "4.78 L")
- Status badge: In Stock / Low Stock / Out of Stock
- Tap → open Product Detail sheet

### Product Detail Sheet (bottom sheet)
- Product name, category, status
- On-hand total
- Batches list:
  - Each batch: quantity (editable inline), expiry date, location
  - Edit quantity inline → Save button
  - Delete batch (with confirm)
- Actions:
  - "Add Batch" button → Add Batch form
  - "Edit Product" button → product form (same fields as Add Product)
  - "Delete Product" button (admin only) → confirm → delete product + all batches

---

## Add / Edit Product Form
See `mvp-product-form.md` for the full field list.

## Add Batch Form (bottom sheet or modal)
| Field | Input | Required | Notes |
|---|---|---|---|
| Quantity | NumericInput | Yes | In displayUnit |
| Expiry date | DatePicker | No | Leave blank = no expiry |
| Location | TextInput | No | e.g. "Shelf A3", "Freezer 2" |

On save:
- Write `inventory_batches` doc with `quantity` converted to baseUnit
- `source: "manual"`, `addedBy: currentUser.name`

---

## Data Model Reference
```typescript
// Product (products collection)
interface Product {
  id: string;
  name: string;
  category: string;
  baseUnit: "g" | "ml" | "piece";
  displayUnit: string;        // "kg", "g", "L", "ml", "pcs"
  minimumThreshold: number | null;  // in baseUnit
  shelfLifeDays: number | null;
  countable: boolean;
  measurable: boolean;
  unitSize: number | null;
  usageUnit: string | null;   // "ml", "L", "g", "kg"
}

// Batch (inventory_batches collection)
interface InventoryBatch {
  id: string;
  productId: string;
  quantity: number;           // in baseUnit
  expirationDate: Timestamp | null;
  receivedDate: Timestamp | null;
  location: string | null;
  source: string;
  addedBy: string;
}
```

---

## What Changes from Current Mobile

### Admin inventory screen (major rewrite)
- Currently: uses `FirestoreInventoryItem` (flat, single quantity field)
- Target: uses `ProductWithBatches` (same as staff screen)
- Remove: old `adjustQuantity`, `addItem`, `updateItem` calls
- Add: batch-based operations matching `lib/firebase/products.ts`

### Staff inventory screen (minor additions)
- Add missing product fields to AddProductModal: `minimumThreshold`, `shelfLifeDays`, `measurable`, `unitSize`, `usageUnit`
- The batch model and ProductBatchSheet already work - keep them

### Shared
- Category list must match admin web (7 categories)
- Unit options: pcs, kg, g, L, ml
- Usage unit options (when measurable): ml, L, g, kg
