# MVP: Prepare Recipe (Mobile)

The core production flow. Both admin and staff can prepare a recipe. Preparing a recipe is what
actually deducts inventory (batches and used_stock). Recipe create/edit does NOT deduct anything.

## Access
- Admin: `(admin)/recipes` → recipe card → "Prepare" button
- Staff: `(staff)/recipes` → recipe card → "Prepare" button
- Route: `prepare/[recipeId]` (modal sheet or full screen)

---

## Screen Layout

### 1. Header
- Recipe name
- Category badge
- Back / Close button

### 2. Servings Stepper
- Numeric stepper: 1 … maxServings
- maxServings = min of all per-ingredient max servings (same logic as admin web availability)
- If any ingredient is unlinked / insufficient: maxServings shows 0, stepper disabled

### 3. Ingredient Checklist
One row per recipe ingredient:

```
[ ✓ / ✗ ]  Cooking Oil        have 6.97 L   need 30 ml   ← enough
[ ✓ / ✗ ]  Soy Sauce          have 4.78 L   need 15 ml   ← enough
[ ✗     ]  Coconut Milk       have 0 ml     need 200 ml  SHORT by 200 ml
```

- "have" = full stock × unitSizeBase + usedStock.remainingBase (for measurable-pcs) OR onHand (others)
- "need" = quantityPerServing × servings, shown in recipe's ingredient unit
- If short: row tinted red, "SHORT by X unit" label

### 4. Confirm Button
- Label: "Confirm Preparation - X servings"
- Disabled if ANY ingredient is short OR servings = 0
- On press: show confirmation alert → on confirm → run deduction logic → navigate back

---

## Deduction Logic (runs on Confirm)

For each ingredient in the recipe:

### Case A - Non-measurable pcs (Egg, Garlic, Sitaw…)
- `product.measurable = false`
- Deduct `quantityPerServing × servings` pcs from inventory batches (FEFO - oldest expiry first)

### Case B - Measurable pcs / bottle-can (Cooking Oil, Soy Sauce…)
- `product.measurable = true` AND `product.baseUnit = "piece"`
- `required = toBaseUnit(quantityPerServing × servings, ingredient.unit)`
- Read `used_stock/{productId}.remainingBase`
- If `remainingBase >= required`:
  - Write `used_stock/{productId}.remainingBase -= required`
- Else (not enough or no entry):
  - `deficit = required - remainingBase`
  - `bottlesToOpen = ceil(deficit / unitSizeBase)` where `unitSizeBase = toBaseUnit(unitSize, usageUnit)`
  - Deduct `bottlesToOpen` pcs from inventory batches (FEFO)
  - Write `used_stock/{productId}.remainingBase = remainingBase + (bottlesToOpen × unitSizeBase) - required`

### Case C - Measurable weight/volume (Rice in kg, Flour in g…)
- `product.baseUnit = "g"` or `"ml"` (not "piece")
- Deduct `toBaseUnit(quantityPerServing × servings, ingredient.unit)` from inventory batches (FEFO)

### After all deductions
- Write `preparations` doc:
  ```
  preparations/{auto-id}
    recipeId: string
    recipeName: string
    category: string
    servings: number
    preparedBy: uid
    preparedByName: string
    date: "YYYY-MM-DD"
    preparedAt: Timestamp
  ```
- Navigate back to recipes list + show success toast

---

## Error Handling
- If a batch deduction would go negative: abort entire transaction, show error toast
- Use a Firestore batch write (or transaction) so deductions are atomic
- If Firestore write fails: show error, leave all data unchanged

---

## Notes
- The ingredient "have" calculation mirrors `availability.ts` from admin web exactly
- `toBaseUnit(value, unit)` conversion table: ml×1, L×1000, g×1, kg×1000, pcs×1, tbsp×14.787, etc.
- Ingredients matched to products by name (case-insensitive trim), same as admin web
- If an ingredient name does not match any product → treat as unlinked, show warning but still allow prep if admin confirms
