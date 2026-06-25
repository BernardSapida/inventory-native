// Sanitizers for numeric TextInputs. `keyboardType="numeric"` is only a
// keyboard hint — it does not stop letters arriving via paste, keyboard
// switching, or Android layouts that still expose alpha keys. Run user input
// through these in onChangeText so the value can only ever hold a number.

/** Keep digits and a single decimal point (for quantities like 2.5). */
export function sanitizeDecimal(text: string): string {
  return text.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

/** Keep digits only (for whole-number fields like servings or days). */
export function sanitizeInteger(text: string): string {
  return text.replace(/[^0-9]/g, "");
}
