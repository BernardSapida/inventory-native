# MVP: Add / Edit Product (Mobile)

Both admin and staff can add and edit products. The form must match the admin web exactly.

## Access
- Admin: `(admin)/inventory` → FAB or row actions
- Staff: `(staff)/inventory` → FAB or row actions

---

## Form Fields

### Basic Info
| Field | Input type | Required | Notes |
|---|---|---|---|
| Name | TextInput | Yes | Free text |
| Category | Picker / Autocomplete | Yes | Same categories as web (Meat, Vegetables, Condiments, Dairy, Dry Goods, Fruits, Seafood) |

### Stock Tracking
| Field | Input type | Required | Notes |
|---|---|---|---|
| Display unit | Picker | Yes | Options: pcs, kg, g, L, ml |
| Minimum threshold | NumericInput | No | In display unit. e.g. "2 pcs", "500 g" |
| Shelf life (days) | NumericInput | No | Whole number. Prefills suggested expiry when adding a batch |

### Measurable (conditional - shown only when displayUnit = "pcs")
When a product is sold/stored by the piece but used in ml or g for recipes (bottles, cans, packs):

| Field | Input type | Required | Notes |
|---|---|---|---|
| Measurable toggle | Switch | No | Default off. If off, hide unit size + usage unit |
| Unit size | NumericInput | Yes (if measurable) | How many usage units fit in 1 piece. e.g. 1000 for a 1L bottle |
| Usage unit | Picker | Yes (if measurable) | Options: ml, L, g, kg |

**Example:** Soy Sauce = pcs, measurable ON, unitSize=750, usageUnit=ml → "750ml per bottle"

---

## Behavior

### On Save (Create)
1. Write `products` doc with all fields
2. `baseUnit` is derived from `displayUnit`:
   - pcs → "piece"
   - kg / g → "g"
   - L / ml → "ml"
3. `minimumThreshold` stored in baseUnit (multiply display value by unit factor)
4. If `measurable=false` (or displayUnit ≠ pcs), set `unitSize=null`, `usageUnit=null`

### On Save (Edit)
- Same as create but `set(data, merge: true)` on existing doc
- Changing `displayUnit` requires recalculating stored `minimumThreshold`

---

## Notes
- No barcode field (removed from admin web as well)
- Initial batch (quantity + expiry) is handled SEPARATELY via "Add Batch" after product is created
- Staff and admin see the same form; the only difference is navigation (which tab they come from)
