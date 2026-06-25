# MVP: Recipe Screen (Mobile - Both Roles)

Both admin and staff can create, edit, and prepare recipes. The current mobile recipe screen
has a critical bug (deducts inventory on save) and uses outdated data models.

## Access
- Admin: `(admin)/recipes`
- Staff: `(staff)/recipes`

---

## Screen Layout

### Header
- Title: "Recipes"
- "+ New Recipe" button (top-right or FAB)

### Filter Chips (horizontal scroll)
- All · Appetizer · Main Course · Side Dish · Dessert · (other categories)

### Recipe Cards
Each card:
- Recipe name
- Category badge
- Serving size (e.g. "serves 4")
- Availability badge: "Can cook X servings" (success) / "Cannot cook" (danger)
- Tap → Recipe Detail

### Recipe Detail Screen / Sheet
- Name, category, serving size
- Ingredients list with availability:
  ```
  Cooking Oil    30 ml    have 6.97 L   ✓
  Soy Sauce      15 ml    have 4.78 L   ✓
  Coconut Milk   200 ml   have 0 ml     ✗
  ```
- Instructions (expandable)
- "Prepare" button → navigates to Prepare Recipe screen
- Edit / Delete (admin only, or creator)

---

## Create / Edit Recipe Form

### Fields
| Field | Input | Required | Notes |
|---|---|---|---|
| Name | TextInput | Yes | |
| Category | Picker | Yes | Appetizer, Main Course, Side Dish, Dessert, Soup, Salad, Beverage |
| Serving size | NumericInput | Yes | Default serving count for this recipe |
| Instructions | Multiline TextInput | No | Step-by-step text |
| Ingredients | List | Yes | At least 1 ingredient |

### Ingredient Row
| Field | Input | Required | Notes |
|---|---|---|---|
| Name | Autocomplete from products | Yes | Must match a product by name |
| Quantity per serving | NumericInput | Yes | |
| Unit | Picker | Yes | Filtered to units compatible with the matched product |

### On Save
- Write `recipes` doc - NO inventory deduction (bug fix)
- Store ingredients as `[{ name, quantityPerServing, unit }]`

---

## Bug Fix Required
Current code in `app/(admin)/recipes/[id].tsx` and `app/(staff)/recipes.tsx` deducts inventory
quantities when a recipe is saved. **Remove this logic entirely.** Deduction only happens
in the Prepare Recipe flow (see `mvp-prepare-recipe.md`).

---

## Recipe Data Model
```typescript
interface RecipeIngredient {
  name: string;           // matched to product by name (case-insensitive)
  quantityPerServing: number;
  unit: string;           // compatible unit for the matched product
}

interface Recipe {
  id: string;
  name: string;
  category: string;       // Appetizer | Main Course | Side Dish | Dessert | Soup | Salad | Beverage
  servingSize: number;
  instructions: string;
  ingredients: RecipeIngredient[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Availability Calculation (same as admin web)
For each ingredient:
1. Find product by name (case-insensitive trim)
2. `haveBase`:
   - Measurable-pcs: `toBaseUnit(onHand × unitSize, usageUnit) + usedStock.remainingBase`
   - Others: `onHand` (already in baseUnit)
3. `needBase = toBaseUnit(quantityPerServing × servings, ingredient.unit)`
4. `maxServings = floor(haveBase / (quantityPerServing in baseUnit))`
5. `canCook = min(maxServings across all ingredients)`

This calculation is read-only (display only). No writes happen until the user taps "Prepare".
