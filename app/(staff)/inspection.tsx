import ScreenHeader from "@/components/ScreenHeader";
import { C, ColorPalette, useColors } from "@/lib/constants";
import { useAppDialog } from "@/lib/dialog";
import {
  disposeInspectedItem,
  submitInspection,
  watchInspections,
} from "@/lib/firebase/inspections";
import { updateBatchDetails, watchInventory } from "@/lib/firebase/products";
import {
  InspectionCondition,
  InspectionModel,
  isDisposable,
} from "@/lib/types/inspection";
import {
  InventoryBatch,
  ProductWithBatches,
  formatQuantity,
  fromBaseUnit,
  toBaseUnit,
} from "@/lib/types/product";
import { useAuthStore } from "@/store/auth";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Spinner } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CONDITIONS: {
  value: InspectionCondition;
  label: string;
  color: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { value: "good", label: "Good", color: C.success, icon: "check-circle" },
  {
    value: "warning",
    label: "Warning",
    color: C.warning,
    icon: "alert-triangle",
  },
  { value: "damaged", label: "Damaged", color: C.danger, icon: "x-circle" },
  { value: "expired", label: "Expired", color: C.textSec, icon: "clock" },
];

type Tab = "assigned" | "history";

/** Parse an MM/DD/YYYY string. Mirrors InventoryScreen's add-batch parser. */
function parseDate(s: string): Date | undefined {
  const parts = s.split("/");
  if (parts.length !== 3) return undefined;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y || y < 2000) return undefined;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? undefined : dt;
}

export default function StaffInspection() {
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert } = useAppDialog();

  const [inspections, setInspections] = useState<InspectionModel[]>([]);
  const [products, setProducts] = useState<ProductWithBatches[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("assigned");

  // Form state. `editing` is set when completing an inspection someone assigned.
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InspectionModel | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [condition, setCondition] = useState<InspectionCondition>("good");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Editable batch details (correcting the record during inspection). Kept in the
  // display unit / MM-DD-YYYY, pre-filled from the selected batch.
  const [batchQty, setBatchQty] = useState("");
  const [batchExpiry, setBatchExpiry] = useState("");
  const [showBatchDatePicker, setShowBatchDatePicker] = useState(false);
  const prefilledBatchRef = useRef<string | null>(null);
  // Validation/errors are shown INLINE inside the sheet. A popup dialog fired from
  // inside a native Modal renders behind it, so the user never sees it.
  const [formError, setFormError] = useState<string | null>(null);

  // Disposal sheet: which inspection, and how much of its batch to write off.
  const [disposing, setDisposing] = useState<InspectionModel | null>(null);
  const [disposeQty, setDisposeQty] = useState("");
  const [disposeBusy, setDisposeBusy] = useState(false);
  const [disposeError, setDisposeError] = useState<string | null>(null);

  useEffect(() => {
    let loaded = 0;
    const done = () => {
      if (++loaded >= 2) setIsLoading(false);
    };
    const u1 = watchInspections((d) => {
      setInspections(d);
      done();
    });
    const u2 = watchInventory((d) => {
      setProducts(d);
      done();
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.product.id === productId) ?? null,
    [products, productId],
  );

  // Pre-fill the editable batch fields whenever a different batch is selected,
  // without clobbering edits the user is making to the same batch.
  useEffect(() => {
    if (!batchId) {
      setBatchQty("");
      setBatchExpiry("");
      prefilledBatchRef.current = null;
      return;
    }
    if (prefilledBatchRef.current === batchId || !selectedProduct) return;
    const b = selectedProduct.batches.find((x) => x.id === batchId);
    if (!b) return;
    setBatchQty(String(fromBaseUnit(b.quantity, selectedProduct.product.displayUnit)));
    setBatchExpiry(
      b.expirationDate ? format(b.expirationDate.toDate(), "MM/dd/yyyy") : "",
    );
    prefilledBatchRef.current = batchId;
  }, [batchId, selectedProduct]);

  // Only inspections assigned to THIS staff member land in their to-do list.
  const assigned = useMemo(
    () =>
      inspections.filter(
        (i) => i.status === "pending" && i.assignedTo === user?.uid,
      ),
    [inspections, user?.uid],
  );
  const history = useMemo(
    () => inspections.filter((i) => i.status === "completed"),
    [inspections],
  );

  function resetForm() {
    setEditing(null);
    setProductId(null);
    setBatchId(null);
    setCondition("good");
    setNotes("");
    setFormError(null);
    setBatchQty("");
    setBatchExpiry("");
    prefilledBatchRef.current = null;
  }

  function openNew() {
    resetForm();
    setShowForm(true);
  }

  function openAssigned(item: InspectionModel) {
    setEditing(item);
    setProductId(item.productId);
    setBatchId(item.batchId);
    setCondition("good");
    setNotes(item.notes ?? "");
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!productId || !selectedProduct) {
      setFormError("Please choose the item you inspected.");
      return;
    }

    // For non-disposable conditions, staff may correct the batch's quantity/expiry.
    // Validate up front so bad input keeps the sheet open. (Disposable conditions
    // adjust quantity through the disposal flow instead.)
    const canEditBatch = !!batchId && !isDisposable(condition);
    const selectedBatch = canEditBatch
      ? selectedProduct.batches.find((b) => b.id === batchId)
      : undefined;
    let batchEdit:
      | { quantityDisplay: number; expirationDate: Date | null }
      | null = null;

    if (canEditBatch && selectedBatch) {
      const unit = selectedProduct.product.displayUnit;
      const qtyNum = Number(batchQty);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        setFormError("Enter a valid batch quantity.");
        return;
      }
      let expDate: Date | null = null;
      if (batchExpiry.trim()) {
        const parsed = parseDate(batchExpiry.trim());
        if (!parsed) {
          setFormError("Enter a valid expiry date (MM/DD/YYYY).");
          return;
        }
        expDate = parsed;
      }
      // Only write if something actually changed.
      const origQty = fromBaseUnit(selectedBatch.quantity, unit);
      const origExp = selectedBatch.expirationDate
        ? format(selectedBatch.expirationDate.toDate(), "MM/dd/yyyy")
        : "";
      const newExp = expDate ? format(expDate, "MM/dd/yyyy") : "";
      if (qtyNum !== origQty || newExp !== origExp) {
        batchEdit = { quantityDisplay: qtyNum, expirationDate: expDate };
      }
    }

    setFormError(null);
    setSaving(true);
    try {
      const id = await submitInspection({
        inspectionId: editing?.id,
        productId,
        batchId,
        itemName: selectedProduct.product.name,
        condition,
        notes: notes.trim(),
        staffId: user?.uid ?? "",
        staffName: user?.fullName ?? "Staff",
      });

      if (batchEdit && batchId) {
        await updateBatchDetails({
          batchId,
          quantityDisplay: batchEdit.quantityDisplay,
          displayUnit: selectedProduct.product.displayUnit,
          expirationDate: batchEdit.expirationDate,
          itemName: selectedProduct.product.name,
        });
      }

      setShowForm(false);
      const name = selectedProduct.product.name;
      const disposable = isDisposable(condition) && !!batchId;
      resetForm();

      if (disposable) {
        // The whole point of flagging damaged/expired stock is getting it out of
        // inventory. Offer that right here rather than making them hunt for it.
        openDisposal({
          id,
          productId,
          batchId,
          itemName: name,
          condition,
          status: "completed",
          notes: notes.trim(),
          disposed: false,
          disposedAt: null,
          disposedQuantity: null,
          assignedTo: null,
          assignedToName: null,
          assignedBy: null,
          dueDate: null,
          staffId: user?.uid ?? "",
        });
      } else {
        showAlert("Submitted", "Inspection report submitted successfully.");
      }
    } catch (e: unknown) {
      // Keep the sheet open and show the error inline, where it stays visible.
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** Open the disposal sheet, pre-filled with the whole batch. */
  function openDisposal(item: InspectionModel) {
    const row = products.find((p) => p.product.id === item.productId);
    const batch = row?.batches.find((b) => b.id === item.batchId);
    setDisposing(item);
    setDisposeError(null);
    // Default to the full batch - the common case is "all of it spoiled". Staff
    // can lower it when only part went bad.
    setDisposeQty(
      batch
        ? String(fromBaseUnit(batch.quantity, row!.product.displayUnit))
        : "",
    );
  }

  async function confirmDisposal() {
    if (!disposing) return;
    const row = products.find((p) => p.product.id === disposing.productId);
    const batch = row?.batches.find((b) => b.id === disposing.batchId);
    if (!row || !batch) {
      setDisposeError("That batch no longer exists.");
      return;
    }

    const entered = Number(disposeQty);
    if (!Number.isFinite(entered) || entered <= 0) {
      setDisposeError("Enter how much is being disposed.");
      return;
    }

    // The user types in the display unit (kg); stock is stored in the base unit (g).
    const qtyBase = toBaseUnit(entered, row.product.displayUnit);
    if (qtyBase > batch.quantity) {
      setDisposeError(
        `This batch only has ${formatQuantity(batch.quantity, row.product.displayUnit)} left.`,
      );
      return;
    }
    setDisposeError(null);

    const isFull = qtyBase >= batch.quantity;
    const remaining = batch.quantity - qtyBase;

    // No confirmation step: the sheet already shows exactly what will be written
    // off and what remains. Just do it, keeping the button in a loading state
    // until it's done, then confirm with a success alert.
    setDisposeBusy(true);
    try {
      await disposeInspectedItem({
        inspection: disposing,
        quantityBase: qtyBase,
        displayUnit: row.product.displayUnit,
        disposedBy: user?.uid ?? "",
        disposedByName: user?.fullName ?? "Staff",
      });
      setDisposing(null);
      showAlert(
        "Disposed",
        isFull
          ? `${disposing.itemName} was removed from inventory and logged in the history.`
          : `${formatQuantity(qtyBase, row.product.displayUnit)} of ${disposing.itemName} was written off. ${formatQuantity(remaining, row.product.displayUnit)} remains.`,
      );
    } catch (e: unknown) {
      setDisposeError((e as Error).message);
    } finally {
      setDisposeBusy(false);
    }
  }

  function conditionMeta(c: InspectionCondition | null) {
    return (
      CONDITIONS.find((d) => d.value === c) ?? {
        color: palette.textSec,
        label: "Pending",
        icon: "clock" as const,
      }
    );
  }

  const rows = tab === "assigned" ? assigned : history;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Inspections" />

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["assigned", "history"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "assigned" ? `Assigned (${assigned.length})` : "History"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="clipboard" size={40} color={palette.border} />
              <Text style={styles.emptyText}>
                {tab === "assigned"
                  ? "No inspections assigned to you"
                  : "No inspections recorded yet"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = conditionMeta(item.condition);
            const canDispose =
              item.status === "completed" &&
              isDisposable(item.condition) &&
              !!item.batchId &&
              !item.disposed;

            return (
              <TouchableOpacity
                activeOpacity={item.status === "pending" ? 0.7 : 1}
                onPress={() => item.status === "pending" && openAssigned(item)}
                style={[
                  styles.card,
                  { borderLeftColor: meta.color, borderLeftWidth: 3 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.itemName}</Text>

                  {item.status === "pending" ? (
                    <Text style={styles.meta}>
                      Assigned
                      {item.dueDate
                        ? ` · due ${format(item.dueDate.toDate(), "MMM d")}`
                        : ""}{" "}
                      · tap to inspect
                    </Text>
                  ) : (
                    <Text style={styles.meta}>
                      By {item.staffName ?? "Unknown"}
                      {item.checkedAt
                        ? ` · ${format(item.checkedAt, "MMM d, h:mm a")}`
                        : ""}
                    </Text>
                  )}

                  {item.notes ? (
                    <Text style={styles.notes}>{item.notes}</Text>
                  ) : null}

                  {item.disposed && (
                    <View style={styles.disposedRow}>
                      <Feather
                        name="trash-2"
                        size={12}
                        color={palette.textSec}
                      />
                      <Text style={styles.disposedText}>
                        Disposed
                        {item.disposedQuantity != null
                          ? ` · ${item.disposedQuantity} written off`
                          : ""}
                      </Text>
                    </View>
                  )}

                  {canDispose && (
                    <TouchableOpacity
                      style={styles.disposeBtn}
                      onPress={() => openDisposal(item)}
                    >
                      <Feather name="trash-2" size={13} color={C.danger} />
                      <Text style={styles.disposeBtnText}>
                        Dispose from inventory
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View
                  style={[
                    styles.conditionBadge,
                    { backgroundColor: meta.color + "22" },
                  ]}
                >
                  <Text style={[styles.conditionText, { color: meta.color }]}>
                    {(item.condition ?? "pending").toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={openNew}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Inspection form */}
      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editing ? "Complete Inspection" : "New Inspection"}
              </Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Item: a real product, not free text -- disposal has to know which
                  stock to remove, and a typed name can't tell us that. */}
              <Text style={styles.fieldLabel}>Item</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => !editing && setPickerOpen(true)}
                disabled={!!editing}
              >
                <Text
                  style={[
                    styles.pickerText,
                    !selectedProduct && { color: palette.textSec },
                  ]}
                >
                  {selectedProduct?.product.name ??
                    "Select an item from inventory"}
                </Text>
                {!editing && (
                  <Feather
                    name="chevron-down"
                    size={18}
                    color={palette.textSec}
                  />
                )}
              </TouchableOpacity>

              {/* Batch: which physical lot. Required to dispose. */}
              {selectedProduct && selectedProduct.batches.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Batch</Text>
                  <View style={{ marginBottom: 16, gap: 8 }}>
                    {selectedProduct.batches.map((b: InventoryBatch) => (
                      <TouchableOpacity
                        key={b.id}
                        style={[
                          styles.batchRow,
                          batchId === b.id && {
                            borderColor: C.brand,
                            backgroundColor: C.brand + "15",
                          },
                        ]}
                        onPress={() =>
                          setBatchId(batchId === b.id ? null : b.id)
                        }
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.batchQty}>
                            {formatQuantity(
                              b.quantity,
                              selectedProduct.product.displayUnit,
                            )}
                          </Text>
                          <Text style={styles.batchMeta}>
                            {b.expirationDate
                              ? `Expires ${format(b.expirationDate.toDate(), "MMM d, yyyy")}`
                              : "No expiry set"}
                            {b.location ? ` · ${b.location}` : ""}
                          </Text>
                        </View>
                        {batchId === b.id && (
                          <Feather name="check" size={16} color={C.brand} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Condition</Text>
              <View style={styles.conditionRow}>
                {CONDITIONS.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[
                      styles.conditionBtn,
                      condition === c.value && {
                        borderColor: c.color,
                        backgroundColor: c.color + "22",
                      },
                    ]}
                    onPress={() => setCondition(c.value)}
                  >
                    <Feather
                      name={c.icon}
                      size={16}
                      color={condition === c.value ? c.color : palette.textSec}
                    />
                    <Text
                      style={[
                        styles.conditionBtnText,
                        condition === c.value && { color: c.color },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Correct the batch's recorded quantity / expiry if the physical
                  check turns up something different. Hidden for damaged/expired,
                  where the disposal flow adjusts quantity instead. */}
              {batchId && selectedProduct && !isDisposable(condition) && (
                <>
                  <Text style={styles.fieldLabel}>
                    Batch quantity ({selectedProduct.product.displayUnit})
                  </Text>
                  <TextInput
                    style={[styles.formInput, { marginBottom: 16 }]}
                    value={batchQty}
                    onChangeText={(t) => {
                      setBatchQty(t);
                      if (formError) setFormError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={palette.textSec}
                  />

                  <Text style={styles.fieldLabel}>Batch expiry (MM/DD/YYYY)</Text>
                  <TouchableOpacity
                    style={[
                      styles.formInput,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      },
                    ]}
                    onPress={() => setShowBatchDatePicker(true)}
                  >
                    <Text
                      style={{
                        color: batchExpiry ? palette.text : palette.textSec,
                        fontSize: 14,
                      }}
                    >
                      {batchExpiry || "No expiry set"}
                    </Text>
                    <Feather name="calendar" size={16} color={palette.textSec} />
                  </TouchableOpacity>
                  <Text style={styles.batchEditHint}>
                    Update these if the actual quantity or expiry differs from what
                    is recorded.
                  </Text>
                </>
              )}

              {/* Tell them what's about to happen before they submit. */}
              {isDisposable(condition) && (
                <View style={styles.warnBox}>
                  <Feather name="alert-triangle" size={14} color={C.warning} />
                  <Text style={styles.warnText}>
                    {batchId
                      ? "You'll be offered the option to dispose of this batch and remove it from inventory."
                      : "Select a batch above if you want to dispose of this item after submitting."}
                  </Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    height: 80,
                    textAlignVertical: "top",
                    paddingTop: 10,
                    marginBottom: 20,
                  },
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional notes..."
                placeholderTextColor={palette.textSec}
                multiline
              />

              {formError && <Text style={styles.inlineErr}>{formError}</Text>}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <Spinner size="sm" />
                ) : (
                  <Text style={styles.saveBtnText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Disposal sheet - how much of the batch actually went bad. */}
      <Modal
        visible={!!disposing}
        transparent
        animationType="slide"
        onRequestClose={() => setDisposing(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dispose item</Text>
              <TouchableOpacity onPress={() => setDisposing(null)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            {(() => {
              if (!disposing) return null;
              const row = products.find(
                (p) => p.product.id === disposing.productId,
              );
              const batch = row?.batches.find(
                (b) => b.id === disposing.batchId,
              );
              if (!row || !batch) {
                return (
                  <Text style={styles.emptyText}>
                    That batch no longer exists.
                  </Text>
                );
              }
              const unit = row.product.displayUnit;

              return (
                <>
                  <Text style={styles.disposeItem}>{disposing.itemName}</Text>
                  <Text style={styles.meta}>
                    Marked {disposing.condition} ·{" "}
                    {formatQuantity(batch.quantity, unit)} in this batch
                  </Text>

                  <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
                    How much is damaged/expired? ({unit})
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={disposeQty}
                    onChangeText={(t) => {
                      setDisposeQty(t);
                      if (disposeError) setDisposeError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder={`Max ${fromBaseUnit(batch.quantity, unit)}`}
                    placeholderTextColor={palette.textSec}
                  />

                  <TouchableOpacity
                    style={styles.allBtn}
                    onPress={() =>
                      setDisposeQty(String(fromBaseUnit(batch.quantity, unit)))
                    }
                  >
                    <Text style={styles.allBtnText}>Dispose entire batch</Text>
                  </TouchableOpacity>

                  {/* Show what will be left, so partial write-offs are unambiguous. */}
                  {(() => {
                    const n = Number(disposeQty);
                    if (!Number.isFinite(n) || n <= 0) return null;
                    const qtyBase = toBaseUnit(n, unit);
                    if (qtyBase > batch.quantity) {
                      return (
                        <Text style={styles.disposeErr}>
                          Only {formatQuantity(batch.quantity, unit)} available
                          in this batch.
                        </Text>
                      );
                    }
                    const left = batch.quantity - qtyBase;
                    return (
                      <Text style={styles.disposePreview}>
                        {left <= 0
                          ? "Entire batch will be removed from inventory."
                          : `${formatQuantity(left, unit)} will remain on hand.`}
                      </Text>
                    );
                  })()}

                  {disposeError && (
                    <Text style={[styles.disposeErr, { marginTop: 12 }]}>
                      {disposeError}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      { backgroundColor: C.danger, marginTop: 20 },
                      disposeBusy && { opacity: 0.6 },
                    ]}
                    onPress={confirmDisposal}
                    disabled={disposeBusy}
                  >
                    {disposeBusy ? (
                      <Spinner size="sm" />
                    ) : (
                      <Text style={styles.saveBtnText}>
                        Dispose &amp; remove from stock
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Product picker */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Item</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Feather name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={products}
              keyExtractor={(p) => p.product.id}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No products in inventory.</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setProductId(item.product.id);
                    // Default to the batch expiring soonest -- it's the one most
                    // likely being inspected, and it's the FEFO front.
                    setBatchId(item.batches[0]?.id ?? null);
                    setFormError(null);
                    setPickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.product.name}</Text>
                    <Text style={styles.meta}>
                      {formatQuantity(item.onHand, item.product.displayUnit)} on
                      hand · {item.batches.length} batch
                      {item.batches.length === 1 ? "" : "es"}
                    </Text>
                  </View>
                  {productId === item.product.id && (
                    <Feather name="check" size={18} color={C.brand} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Expiry picker for the batch-details editor. Rendered at the root so it
          stacks above the form sheet instead of behind it. */}
      {showBatchDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={batchExpiry ? (parseDate(batchExpiry) ?? new Date()) : new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowBatchDatePicker(false);
            if (date) setBatchExpiry(format(date, "MM/dd/yyyy"));
          }}
        />
      )}
      {showBatchDatePicker && Platform.OS === "ios" && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setShowBatchDatePicker(false)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowBatchDatePicker(false)}
            />
            <View style={styles.dateSheet}>
              <View style={styles.dateSheetHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setBatchExpiry("");
                    setShowBatchDatePicker(false);
                  }}
                >
                  <Text style={styles.dateSheetClear}>Clear</Text>
                </TouchableOpacity>
                <Text style={styles.dateSheetTitle}>Batch Expiry</Text>
                <TouchableOpacity onPress={() => setShowBatchDatePicker(false)}>
                  <Text style={styles.dateSheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={
                  batchExpiry ? (parseDate(batchExpiry) ?? new Date()) : new Date()
                }
                mode="date"
                display="spinner"
                onChange={(_, date) => {
                  if (date) setBatchExpiry(format(date, "MM/dd/yyyy"));
                }}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function makeStyles(C_: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C_.bg },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 8,
      marginBottom: 12,
    },
    tab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: C_.surface,
      borderWidth: 1,
      borderColor: C_.border,
    },
    tabActive: { backgroundColor: C.brand + "22", borderColor: C.brand },
    tabText: { color: C_.textSec, fontSize: 13, fontWeight: "600" },
    tabTextActive: { color: C.brand },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
      gap: 12,
    },
    emptyText: { color: C_.textSec, fontSize: 14, textAlign: "center" },
    card: {
      backgroundColor: C_.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C_.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    itemName: { color: C_.text, fontSize: 15, fontWeight: "600" },
    meta: { color: C_.textSec, fontSize: 12, marginTop: 2 },
    notes: {
      color: C_.textSec,
      fontSize: 12,
      marginTop: 4,
      fontStyle: "italic",
    },
    disposedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 6,
    },
    disposedText: { color: C_.textSec, fontSize: 11, fontWeight: "600" },
    disposeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.danger + "55",
      backgroundColor: C.danger + "11",
    },
    disposeBtnText: { color: C.danger, fontSize: 12, fontWeight: "700" },
    conditionBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    conditionText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
    fab: {
      position: "absolute",
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.brand,
      justifyContent: "center",
      alignItems: "center",
      elevation: 6,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    modalSheet: {
      backgroundColor: C_.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: "85%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: { color: C_.text, fontSize: 18, fontWeight: "700" },
    fieldLabel: {
      color: C_.textSec,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 8,
      letterSpacing: 0.4,
    },
    formInput: {
      backgroundColor: C_.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C_.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C_.text,
      fontSize: 14,
    },
    pickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C_.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C_.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 16,
    },
    pickerText: { color: C_.text, fontSize: 14, flex: 1 },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C_.border,
    },
    batchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: C_.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C_.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    batchQty: { color: C_.text, fontSize: 14, fontWeight: "600" },
    batchMeta: { color: C_.textSec, fontSize: 11, marginTop: 2 },
    conditionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    conditionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C_.border,
      backgroundColor: C_.bg,
    },
    conditionBtnText: { color: C_.textSec, fontSize: 13, fontWeight: "600" },
    warnBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
      backgroundColor: C.warning + "15",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    warnText: { color: C_.textSec, fontSize: 12, flex: 1, lineHeight: 17 },
    inlineErr: {
      color: C.danger,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 12,
      textAlign: "center",
    },
    batchEditHint: {
      color: C_.textSec,
      fontSize: 11,
      lineHeight: 15,
      marginBottom: 16,
    },
    dateSheet: {
      backgroundColor: C_.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 20,
    },
    dateSheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C_.border,
    },
    dateSheetTitle: { color: C_.text, fontSize: 15, fontWeight: "700" },
    dateSheetClear: { color: C.danger, fontSize: 14, fontWeight: "600" },
    dateSheetDone: { color: C.brand, fontSize: 14, fontWeight: "700" },
    saveBtn: {
      backgroundColor: C.brand,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
      marginBottom: 10,
    },
    saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    disposeItem: { color: C_.text, fontSize: 17, fontWeight: "700" },
    allBtn: {
      alignSelf: "flex-start",
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C_.border,
    },
    allBtnText: { color: C_.textSec, fontSize: 12, fontWeight: "600" },
    disposePreview: { color: C_.textSec, fontSize: 12, marginTop: 12 },
    disposeErr: {
      color: C.danger,
      fontSize: 12,
      marginTop: 12,
      fontWeight: "600",
    },
  });
}
