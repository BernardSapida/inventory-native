// Shared inventory screen for both staff and admin mobile.
// Tabs: Stock | Used Stock | Expiry
// Features: search, category filter, add/edit/delete product, add batch with location,
//           inline batch qty edit, used-stock view, expiry urgency tracker.

import { EmptyState } from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { Toast } from "@/components/Toast";
import { C, ColorPalette, useColors } from "@/lib/constants";
import { sanitizeDecimal, sanitizeInteger } from "@/lib/input";
import { useAppDialog } from "@/lib/dialog";
import {
  addBatch,
  deleteProduct,
  saveProduct,
  updateBatchQuantity,
  watchInventory,
  watchUsedStock,
} from "@/lib/firebase/products";
import {
  formatQuantity,
  fromBaseUnit,
  type ProductWithBatches,
  type UsedStock,
} from "@/lib/types/product";
import { useAuthStore } from "@/store/auth";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { differenceInDays, format } from "date-fns";
import { useRouter } from "expo-router";
import { Spinner } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Constants ───────────────────────────────────────────────────────────────

const UNIT_OPTIONS = ["pcs", "kg", "g", "L", "ml"];
const USAGE_UNIT_OPTIONS = ["ml", "L", "g", "kg"];
const CATEGORIES = [
  "Meat",
  "Vegetables",
  "Condiments",
  "Dairy",
  "Dry Goods",
  "Fruits",
  "Seafood",
  "General",
];

type Tab = "stock" | "used_stock" | "expiry";
type Urgency = "expired" | "critical" | "warning" | "watch" | "ok";

interface BatchFlat {
  batchId: string;
  productName: string;
  category: string;
  displayUnit: string;
  quantity: number;
  expirationDate: Date;
  daysLeft: number;
  urgency: Urgency;
  location: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urgencyOf(daysLeft: number): Urgency {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 3) return "critical";
  if (daysLeft <= 7) return "warning";
  if (daysLeft <= 30) return "watch";
  return "ok";
}

function urgencyMeta(urgency: Urgency, palette: ColorPalette) {
  switch (urgency) {
    case "expired":
      return {
        label: "EXPIRED",
        color: palette.danger,
        bg: palette.dangerSoft,
      };
    case "critical":
      return {
        label: "CRITICAL",
        color: palette.danger,
        bg: palette.dangerSoft,
      };
    case "warning":
      return {
        label: "WARNING",
        color: palette.warning,
        bg: palette.warningSoft,
      };
    case "watch":
      return { label: "WATCH", color: palette.brand, bg: palette.brandSoft };
    default:
      return { label: "OK", color: palette.success, bg: palette.successSoft };
  }
}

function statusMeta(
  status: ProductWithBatches["status"],
  palette: ColorPalette,
) {
  if (status === "out")
    return { label: "OUT", color: palette.danger, bg: palette.dangerSoft };
  if (status === "low")
    return { label: "LOW", color: palette.warning, bg: palette.warningSoft };
  return { label: "OK", color: palette.success, bg: palette.successSoft };
}

function parseDate(s: string): Date | undefined {
  const parts = s.split("/");
  if (parts.length !== 3) return undefined;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y || y < 2000) return undefined;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? undefined : dt;
}

function fmtRemaining(
  remainingBase: number,
  usageUnit: string | null,
  displayUnit: string,
): string {
  const unit = usageUnit ?? displayUnit;
  const v = fromBaseUnit(remainingBase, unit);
  return `${Math.round(v * 100) / 100} ${unit}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showAlert, showConfirm } = useAppDialog();

  const [tab, setTab] = useState<Tab>("stock");
  const [rows, setRows] = useState<ProductWithBatches[]>([]);
  const [usedStockItems, setUsedStockItems] = useState<UsedStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const [selected, setSelected] = useState<ProductWithBatches | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductWithBatches | null>(null);
  const [batchTarget, setBatchTarget] = useState<ProductWithBatches | null>(
    null,
  );

  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "success") => {
      setToast({ msg, type });
    },
    [],
  );

  useEffect(() => {
    let loaded = 0;
    const check = () => {
      if (++loaded >= 2) setIsLoading(false);
    };
    const u1 = watchInventory((d) => {
      setRows(d);
      check();
    });
    const u2 = watchUsedStock((d) => {
      setUsedStockItems(d);
      check();
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const liveSelected = selected
    ? (rows.find((r) => r.product.id === selected.product.id) ?? null)
    : null;

  function handleSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => setSearchQ(text.trim().toLowerCase()),
      300,
    );
  }

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(rows.map((r) => r.product.category).filter(Boolean)),
      ),
    ],
    [rows],
  );

  const filtered = rows.filter((r) => {
    const matchSearch =
      !searchQ ||
      r.product.name.toLowerCase().includes(searchQ) ||
      r.product.category.toLowerCase().includes(searchQ);
    const matchCat =
      activeCategory === "All" || r.product.category === activeCategory;
    return matchSearch && matchCat;
  });

  const usedStockRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.product.id, r]));
    return usedStockItems
      .filter((u) => u.remainingBase > 0)
      .map((u) => ({ us: u, row: byId.get(u.id) }))
      .filter((x): x is { us: UsedStock; row: ProductWithBatches } => !!x.row);
  }, [usedStockItems, rows]);

  const expiryItems = useMemo((): BatchFlat[] => {
    const today = new Date();
    const flat: BatchFlat[] = [];
    for (const r of rows) {
      for (const b of r.batches) {
        if (!b.expirationDate) continue;
        const expDate = b.expirationDate.toDate();
        const daysLeft = differenceInDays(expDate, today);
        flat.push({
          batchId: b.id,
          productName: r.product.name,
          category: r.product.category,
          displayUnit: r.product.displayUnit,
          quantity: b.quantity,
          expirationDate: expDate,
          daysLeft,
          urgency: urgencyOf(daysLeft),
          location: b.location,
        });
      }
    }
    return flat.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [rows]);

  function handleDeleteProduct(row: ProductWithBatches) {
    showConfirm(
      "Delete Product",
      `Remove "${row.product.name}" and all its batches? This cannot be undone.`,
      async () => {
        await deleteProduct(row.product.id);
        setSelected(null);
        showToast(`"${row.product.name}" deleted`, "info");
      },
      "Delete",
    );
  }

  const addedBy = user?.fullName ?? "staff";

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Inventory"
        right={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push("/camera" as never)}
            >
              <Feather name="camera" size={20} color={palette.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setAddOpen(true)}
            >
              <Feather name="plus" size={20} color={palette.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : tab === "stock" ? (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.product.id}
          contentContainerStyle={
            filtered.length === 0 ? [styles.list, { flex: 1 }] : styles.list
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ marginHorizontal: -20 }}>
              {/* Tab row */}
              <View style={styles.tabRow}>
                {(["stock", "used_stock", "expiry"] as Tab[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tab, tab === t && styles.tabActive]}
                    onPress={() => setTab(t)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === t && styles.tabTextActive,
                      ]}
                    >
                      {t === "stock"
                        ? "Stock"
                        : t === "used_stock"
                          ? "Used Stock"
                          : "Expiry"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Search */}
              <View style={styles.searchRow}>
                <Feather
                  name="search"
                  size={16}
                  color={palette.textSec}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search products..."
                  placeholderTextColor={palette.textSec}
                  value={search}
                  onChangeText={handleSearch}
                />
                {search ? (
                  <TouchableOpacity
                    onPress={() => {
                      setSearch("");
                      setSearchQ("");
                    }}
                  >
                    <Feather name="x" size={16} color={palette.textSec} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {/* Category chips */}
              <View style={styles.chipScroll}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        activeCategory === cat && styles.chipActive,
                      ]}
                      onPress={() => setActiveCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          activeCategory === cat && styles.chipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="package"
              title="No products found"
              subtitle="Try a different search or add a product."
            />
          }
          renderItem={({ item }) => {
            const meta = statusMeta(item.status, palette);
            return (
              <TouchableOpacity
                style={styles.itemCard}
                onPress={() => setSelected(item)}
                activeOpacity={0.8}
              >
                <View style={styles.itemIconWrap}>
                  <Feather name="package" size={20} color={C.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.product.name}</Text>
                  <Text style={styles.itemMeta}>
                    {item.product.category} · {item.batches.length} batch
                    {item.batches.length !== 1 ? "es" : ""}
                  </Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>
                    {formatQuantity(item.onHand, item.product.displayUnit)}
                  </Text>
                  <View
                    style={[styles.statusPill, { backgroundColor: meta.bg }]}
                  >
                    <Text style={[styles.statusText, { color: meta.color }]}>
                      {meta.label}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : tab === "used_stock" ? (
        <FlatList
          data={usedStockRows}
          keyExtractor={(x) => x.us.id}
          contentContainerStyle={
            usedStockRows.length === 0
              ? [styles.list, { flex: 1 }]
              : styles.list
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ marginHorizontal: -20, marginBottom: 12 }}>
              <View style={styles.tabRow}>
                {(["stock", "used_stock", "expiry"] as Tab[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tab, tab === t && styles.tabActive]}
                    onPress={() => setTab(t)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === t && styles.tabTextActive,
                      ]}
                    >
                      {t === "stock"
                        ? "Stock"
                        : t === "used_stock"
                          ? "Used Stock"
                          : "Expiry"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="droplet"
              title="No opened stock"
              subtitle="Remaining opened ingredients appear here after preparation."
            />
          }
          renderItem={({ item: { us, row } }) => {
            const remaining = fmtRemaining(
              us.remainingBase,
              row.product.usageUnit,
              row.product.displayUnit,
            );
            const lastUpd = us.updatedAt
              ? format(new Date(us.updatedAt), "MMM d, h:mm a")
              : "-";
            return (
              <View style={styles.itemCard}>
                <View
                  style={[
                    styles.itemIconWrap,
                    { backgroundColor: palette.brandSoft },
                  ]}
                >
                  <Feather name="droplet" size={20} color={C.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{row.product.name}</Text>
                  <Text style={styles.itemMeta}>{row.product.category}</Text>
                  <Text
                    style={[
                      styles.itemMeta,
                      { marginTop: 4, color: palette.text, fontWeight: "600" },
                    ]}
                  >
                    Remaining: {remaining}
                  </Text>
                  <Text style={[styles.itemMeta, { marginTop: 2 }]}>
                    Updated: {lastUpd}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        /* Expiry tab */
        <FlatList
          data={expiryItems}
          keyExtractor={(x) => x.batchId}
          contentContainerStyle={
            expiryItems.length === 0 ? [styles.list, { flex: 1 }] : styles.list
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ marginHorizontal: -20, marginBottom: 12 }}>
              <View style={styles.tabRow}>
                {(["stock", "used_stock", "expiry"] as Tab[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tab, tab === t && styles.tabActive]}
                    onPress={() => setTab(t)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === t && styles.tabTextActive,
                      ]}
                    >
                      {t === "stock"
                        ? "Stock"
                        : t === "used_stock"
                          ? "Used Stock"
                          : "Expiry"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="check-circle"
              title="No batches with expiry dates"
              subtitle="Add expiry dates when receiving stock to track them here."
            />
          }
          renderItem={({ item }) => {
            const meta = urgencyMeta(item.urgency, palette);
            return (
              <View
                style={[
                  styles.itemCard,
                  { borderLeftWidth: 4, borderLeftColor: meta.color },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: meta.bg, marginLeft: 8 },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: meta.color }]}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.itemMeta}>{item.category}</Text>
                  <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
                    <Text style={styles.itemMeta}>
                      Qty: {formatQuantity(item.quantity, item.displayUnit)}
                    </Text>
                    <Text style={styles.itemMeta}>
                      Exp: {format(item.expirationDate, "MMM d, yyyy")}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.itemMeta,
                      { marginTop: 4, color: meta.color, fontWeight: "600" },
                    ]}
                  >
                    {item.daysLeft < 0
                      ? `Expired ${Math.abs(item.daysLeft)} day${Math.abs(item.daysLeft) !== 1 ? "s" : ""} ago`
                      : item.daysLeft === 0
                        ? "Expires today"
                        : `${item.daysLeft} day${item.daysLeft !== 1 ? "s" : ""} left`}
                  </Text>
                  {item.location ? (
                    <Text style={styles.itemMeta}>
                      Location: {item.location}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── Product Detail Sheet ── */}
      <Modal
        visible={!!liveSelected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: "88%" }]}>
            {liveSelected && (
            <ProductDetailSheet
              row={liveSelected}
              addedBy={addedBy}
              onToast={showToast}
              onError={(m) => showAlert("Error", m)}
              onEdit={() => {
                setSelected(null);
                setTimeout(() => setEditTarget(liveSelected), 60);
              }}
              onAddBatch={() => {
                setSelected(null);
                setTimeout(() => setBatchTarget(liveSelected), 60);
              }}
              onDelete={() => handleDeleteProduct(liveSelected)}
              onClose={() => setSelected(null)}
            />
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add / Edit Product Modal ── */}
      {(addOpen || !!editTarget) && (
        <ProductFormModal
          initial={editTarget ?? undefined}
          existingNames={rows.map((r) => r.product.name)}
          addedBy={addedBy}
          onClose={() => {
            setAddOpen(false);
            setEditTarget(null);
          }}
          onSaved={(msg) => {
            setAddOpen(false);
            setEditTarget(null);
            showToast(msg);
          }}
          onError={(m) => showAlert("Error", m)}
        />
      )}

      {/* ── Add Batch Modal ── */}
      {!!batchTarget && (
        <AddBatchModal
          target={batchTarget}
          addedBy={addedBy}
          onClose={() => setBatchTarget(null)}
          onSaved={(msg) => {
            setBatchTarget(null);
            showToast(msg);
          }}
          onError={(m) => showAlert("Error", m)}
        />
      )}

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          visible
          onHide={() => setToast(null)}
        />
      )}
    </View>
  );
}

// ─── Product Detail Sheet ─────────────────────────────────────────────────────

function ProductDetailSheet({
  row,
  addedBy,
  onToast,
  onError,
  onEdit,
  onAddBatch,
  onDelete,
  onClose,
}: {
  row: ProductWithBatches;
  addedBy: string;
  onToast: (m: string, t?: "success" | "error" | "info") => void;
  onError: (m: string) => void;
  onEdit: () => void;
  onAddBatch: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle} numberOfLines={1}>
          {row.product.name}
        </Text>
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          <TouchableOpacity onPress={onEdit}>
            <Feather name="edit-2" size={18} color={palette.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onAddBatch}>
            <Feather name="plus-circle" size={20} color={C.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete}>
            <Feather name="trash-2" size={18} color={C.danger} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.detailMeta}>
        <DetailChip label={row.product.category} />
        <DetailChip label={row.product.displayUnit} />
        <DetailChip
          label={`${row.batches.length} batch${row.batches.length !== 1 ? "es" : ""}`}
        />
        {row.product.measurable &&
          row.product.unitSize &&
          row.product.usageUnit && (
            <DetailChip
              label={`${row.product.unitSize}${row.product.usageUnit}/unit`}
            />
          )}
      </View>

      <Text style={[styles.fieldLabel, { marginTop: 8 }]}>ON HAND</Text>
      <Text style={[styles.itemQty, { marginBottom: 12 }]}>
        {formatQuantity(row.onHand, row.product.displayUnit)}
      </Text>

      <Text style={styles.fieldLabel}>BATCHES (FEFO ORDER)</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {row.batches.length === 0 ? (
          <Text style={styles.emptySmall}>No stock on hand.</Text>
        ) : (
          row.batches.map((b) => (
            <BatchRow
              key={b.id}
              batchId={b.id}
              initial={fromBaseUnit(b.quantity, row.product.displayUnit)}
              unit={row.product.displayUnit}
              expiry={
                b.expirationDate
                  ? format(b.expirationDate.toDate(), "MMM d, yyyy")
                  : "No expiry"
              }
              location={b.location}
              onSave={async (val) => {
                await updateBatchQuantity(b.id, val, row.product.displayUnit);
                onToast("Quantity updated.");
              }}
              onError={onError}
            />
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </>
  );
}

// ─── Batch Row (inline quantity edit) ────────────────────────────────────────

function BatchRow({
  batchId,
  initial,
  unit,
  expiry,
  location,
  onSave,
  onError,
}: {
  batchId: string;
  initial: number;
  unit: string;
  expiry: string;
  location: string | null;
  onSave: (val: number) => Promise<void>;
  onError: (m: string) => void;
}) {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [val, setVal] = useState(String(Math.round(initial * 1000) / 1000));
  const [busy, setBusy] = useState(false);

  return (
    <View style={styles.batchRow}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            style={styles.batchInput}
            value={val}
            onChangeText={(t) => setVal(sanitizeDecimal(t))}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
          <Text style={styles.batchUnit}>{unit}</Text>
        </View>
        <Text style={styles.batchExpiry}>Exp: {expiry}</Text>
        {location ? (
          <Text style={styles.batchExpiry}>📍 {location}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.saveSmall}
        disabled={busy}
        onPress={async () => {
          const n = parseFloat(val);
          if (isNaN(n) || n < 0) {
            onError("Invalid quantity.");
            return;
          }
          setBusy(true);
          try {
            await onSave(n);
          } catch (e: unknown) {
            onError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Spinner size="sm" />
        ) : (
          <Text style={styles.saveSmallText}>Save</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Product Form Modal (add + edit) ─────────────────────────────────────────

function ProductFormModal({
  initial,
  existingNames,
  addedBy,
  onClose,
  onSaved,
  onError,
}: {
  initial?: ProductWithBatches;
  existingNames: string[];
  addedBy: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.product.name ?? "");
  const [category, setCategory] = useState(
    initial?.product.category ?? CATEGORIES[0],
  );
  const [unit, setUnit] = useState(initial?.product.displayUnit ?? "pcs");
  const [minThreshold, setMinThreshold] = useState(
    initial?.product.minimumThreshold != null
      ? String(
          Math.round(
            fromBaseUnit(
              initial.product.minimumThreshold,
              initial.product.displayUnit,
            ) * 1000,
          ) / 1000,
        )
      : "",
  );
  const [shelfLife, setShelfLife] = useState(
    initial?.product.shelfLifeDays?.toString() ?? "",
  );
  const [measurable, setMeasurable] = useState(
    initial?.product.measurable ?? false,
  );
  const [unitSize, setUnitSize] = useState(
    initial?.product.unitSize?.toString() ?? "",
  );
  const [usageUnit, setUsageUnit] = useState(
    initial?.product.usageUnit ?? "ml",
  );

  const [qty, setQty] = useState("");
  const [expiry, setExpiry] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const isPcs = unit === "pcs";

  async function handleSave() {
    if (!name.trim()) {
      onError("Product name is required.");
      return;
    }
    // Block duplicate names (case-insensitive). When editing, the product's own
    // name is allowed.
    const nameKey = name.trim().toLowerCase();
    const isSelf = initial?.product.name.trim().toLowerCase() === nameKey;
    if (!isSelf && existingNames.some((n) => n.trim().toLowerCase() === nameKey)) {
      onError(`A product named "${name.trim()}" already exists.`);
      return;
    }
    if (isPcs && measurable && !unitSize) {
      onError("Unit size is required for measurable products.");
      return;
    }
    setSaving(true);
    try {
      const productId = await saveProduct(
        {
          name: name.trim(),
          category,
          displayUnit: unit,
          minimumThreshold: minThreshold ? parseFloat(minThreshold) : null,
          shelfLifeDays: shelfLife ? parseInt(shelfLife) : null,
          measurable: isPcs && measurable,
          unitSize:
            isPcs && measurable && unitSize ? parseFloat(unitSize) : null,
          usageUnit: isPcs && measurable ? usageUnit : null,
        },
        initial?.product.id,
      );

      if (!isEdit) {
        const n = parseFloat(qty);
        if (!isNaN(n) && n > 0) {
          const expiryDate = expiry.trim()
            ? (parseDate(expiry.trim()) ?? null)
            : null;
          await addBatch({
            productId,
            displayUnit: unit,
            quantityDisplay: n,
            expirationDate: expiryDate,
            addedBy,
          });
        }
      }

      onSaved(isEdit ? "Product updated." : "Product added.");
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: "95%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEdit ? "Edit Product" : "Add Product"}
              </Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={palette.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FL label="PRODUCT NAME">
              <TextInput
                style={styles.formInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Cooking Oil"
                placeholderTextColor={palette.textSec}
              />
            </FL>

            <FL label="CATEGORY">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, category === c && styles.chipActive]}
                      onPress={() => setCategory(c)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          category === c && styles.chipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </FL>

            <FL label="DISPLAY UNIT">
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {UNIT_OPTIONS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, unit === u && styles.chipActive]}
                    onPress={() => {
                      setUnit(u);
                      if (u !== "pcs") setMeasurable(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        unit === u && styles.chipTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FL>

            <FL label="MIN THRESHOLD (optional)">
              <TextInput
                style={styles.formInput}
                value={minThreshold}
                onChangeText={(t) => setMinThreshold(sanitizeDecimal(t))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder={`In ${unit}`}
                placeholderTextColor={palette.textSec}
              />
            </FL>

            <FL label="SHELF LIFE (days, optional)">
              <TextInput
                style={styles.formInput}
                value={shelfLife}
                onChangeText={(t) => setShelfLife(sanitizeInteger(t))}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="e.g. 90"
                placeholderTextColor={palette.textSec}
              />
            </FL>

            {isPcs && (
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>
                    Measurable (bottles, cans)
                  </Text>
                  <Text style={styles.toggleHint}>
                    Stored in pcs but measured in ml/g
                  </Text>
                </View>
                <Switch
                  value={measurable}
                  onValueChange={setMeasurable}
                  trackColor={{ true: C.brand, false: palette.border }}
                  thumbColor={measurable ? "#fff" : palette.textSec}
                />
              </View>
            )}

            {isPcs && measurable && (
              <>
                <FL label="UNIT SIZE (usage units per piece, e.g. 1000)">
                  <TextInput
                    style={styles.formInput}
                    value={unitSize}
                    onChangeText={(t) => setUnitSize(sanitizeDecimal(t))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="e.g. 1000"
                    placeholderTextColor={palette.textSec}
                  />
                </FL>
                <FL label="USAGE UNIT">
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {USAGE_UNIT_OPTIONS.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[
                          styles.chip,
                          usageUnit === u && styles.chipActive,
                        ]}
                        onPress={() => setUsageUnit(u)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            usageUnit === u && styles.chipTextActive,
                          ]}
                        >
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </FL>
              </>
            )}

            {!isEdit && (
              <>
                <Text style={[styles.sectionDivider]}>
                  INITIAL STOCK (OPTIONAL)
                </Text>
                <FL label="QUANTITY">
                  <TextInput
                    style={styles.formInput}
                    value={qty}
                    onChangeText={(t) => setQty(sanitizeDecimal(t))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="0"
                    placeholderTextColor={palette.textSec}
                  />
                </FL>
                <FL label="EXPIRY DATE (MM/DD/YYYY, optional)">
                  <TouchableOpacity
                    style={[
                      styles.formInput,
                      {
                        justifyContent: "space-between",
                        flexDirection: "row",
                        alignItems: "center",
                      },
                    ]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text
                      style={{
                        color: expiry ? palette.text : palette.textSec,
                        fontSize: 15,
                      }}
                    >
                      {expiry || "Select date (optional)"}
                    </Text>
                    <Feather
                      name="calendar"
                      size={16}
                      color={palette.textSec}
                    />
                  </TouchableOpacity>
                </FL>
              </>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { marginTop: 8 },
                saving && { opacity: 0.6 },
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Spinner size="sm" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {isEdit ? "Save Changes" : "Add Product"}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={expiry ? (parseDate(expiry) ?? new Date()) : new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) setExpiry(format(date, "MM/dd/yyyy"));
          }}
        />
      )}
      {Platform.OS === "ios" && showDatePicker && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            />
            <View style={styles.dateSheet}>
              <View style={styles.dateSheetHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setExpiry("");
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={styles.dateSheetClear}>Clear</Text>
                </TouchableOpacity>
                <Text style={styles.dateSheetTitle}>Expiry Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.dateSheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={expiry ? (parseDate(expiry) ?? new Date()) : new Date()}
                mode="date"
                display="spinner"
                onChange={(_, date) => {
                  if (date) setExpiry(format(date, "MM/dd/yyyy"));
                }}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ─── Add Batch Modal ──────────────────────────────────────────────────────────

function AddBatchModal({
  target,
  addedBy,
  onClose,
  onSaved,
  onError,
}: {
  target: ProductWithBatches;
  addedBy: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [qty, setQty] = useState("");
  const [location, setLocation] = useState("");
  // Pre-fill expiry from the product's shelf life (editable - matches admin's
  // Add batch). Leave blank for non-perishables (no shelf life set).
  const [expiry, setExpiry] = useState(() => {
    const days = target.product.shelfLifeDays;
    if (!days) return "";
    const d = new Date();
    d.setDate(d.getDate() + days);
    return format(d, "MM/dd/yyyy");
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = parseFloat(qty);
    if (isNaN(n) || n <= 0) {
      onError("Enter a quantity greater than 0.");
      return;
    }
    let expiryDate: Date | null = null;
    if (expiry.trim()) {
      expiryDate = parseDate(expiry.trim()) ?? null;
      if (!expiryDate) {
        onError("Invalid date. Use MM/DD/YYYY.");
        return;
      }
    }
    setSaving(true);
    try {
      await addBatch({
        productId: target.product.id,
        displayUnit: target.product.displayUnit,
        quantityDisplay: n,
        expirationDate: expiryDate,
        location: location.trim() || undefined,
        addedBy,
      });
      onSaved("Stock added.");
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add Stock - {target.product.name}
              </Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={palette.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FL label={`QUANTITY (${target.product.displayUnit})`}>
              <TextInput
                style={styles.formInput}
                value={qty}
                onChangeText={(t) => setQty(sanitizeDecimal(t))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="e.g. 10"
                placeholderTextColor={palette.textSec}
              />
            </FL>

            <FL label="EXPIRY DATE (MM/DD/YYYY, optional)">
              <TouchableOpacity
                style={[
                  styles.formInput,
                  {
                    justifyContent: "space-between",
                    flexDirection: "row",
                    alignItems: "center",
                  },
                ]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text
                  style={{
                    color: expiry ? palette.text : palette.textSec,
                    fontSize: 15,
                  }}
                >
                  {expiry || "No expiry"}
                </Text>
                <Feather name="calendar" size={16} color={palette.textSec} />
              </TouchableOpacity>
              {target.product.shelfLifeDays ? (
                <Text
                  style={{
                    color: palette.textSec,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  Pre-filled from shelf life - edit if the printed date differs.
                </Text>
              ) : null}
            </FL>

            <FL label="LOCATION (optional)">
              <TextInput
                style={styles.formInput}
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Shelf A3, Freezer 2"
                placeholderTextColor={palette.textSec}
              />
            </FL>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { marginTop: 8, marginBottom: 24 },
                saving && { opacity: 0.6 },
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Spinner size="sm" />
              ) : (
                <Text style={styles.saveBtnText}>Add Stock</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={expiry ? (parseDate(expiry) ?? new Date()) : new Date()}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) setExpiry(format(date, "MM/dd/yyyy"));
          }}
        />
      )}
      {Platform.OS === "ios" && showDatePicker && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            />
            <View style={styles.dateSheet}>
              <View style={styles.dateSheetHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setExpiry("");
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={styles.dateSheetClear}>Clear</Text>
                </TouchableOpacity>
                <Text style={styles.dateSheetTitle}>Expiry Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.dateSheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={expiry ? (parseDate(expiry) ?? new Date()) : new Date()}
                mode="date"
                display="spinner"
                onChange={(_, date) => {
                  if (date) setExpiry(format(date, "MM/dd/yyyy"));
                }}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  const palette = useColors();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: palette.textSec,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.8,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function DetailChip({ label }: { label: string }) {
  const palette = useColors();
  return (
    <View
      style={{
        backgroundColor: palette.surfaceAlt,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.textSec, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(palette: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    headerActions: { flexDirection: "row", gap: 8 },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      justifyContent: "center",
      alignItems: "center",
    },
    tabRow: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginBottom: 0,
      backgroundColor: palette.surfaceAlt,
      borderRadius: 12,
      padding: 3,
      borderWidth: 1,
      borderColor: palette.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: "center",
    },
    tabActive: {
      backgroundColor: palette.surface,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    tabText: { color: palette.textSec, fontSize: 13, fontWeight: "600" },
    tabTextActive: { color: palette.text, fontWeight: "700" },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: palette.surface,
      marginHorizontal: 16,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 44,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 12,
      marginTop: 12,
    },
    searchInput: { flex: 1, color: palette.text, fontSize: 15 },
    chipScroll: {
      height: 48,
      flexShrink: 0,
      marginBottom: 4,
      overflow: "hidden",
    },
    chipRow: {
      paddingHorizontal: 20,
      alignItems: "center",
      gap: 8,
      height: 48,
    },
    chip: {
      flexShrink: 0,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipActive: {
      backgroundColor: palette.brandSoft,
      borderColor: palette.brand,
    },
    chipText: { color: palette.textSec, fontSize: 13, fontWeight: "500" },
    chipTextActive: { color: palette.brand, fontWeight: "700" },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
    },
    itemCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 12,
    },
    itemIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: palette.brandSoft,
      justifyContent: "center",
      alignItems: "center",
      flexShrink: 0,
    },
    itemName: { color: palette.text, fontSize: 15, fontWeight: "700" },
    itemMeta: { color: palette.textSec, fontSize: 12, marginTop: 2 },
    itemRight: { alignItems: "flex-end", gap: 6 },
    itemQty: { color: palette.text, fontSize: 16, fontWeight: "800" },
    statusPill: { borderRadius: 30, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { fontSize: 11, fontWeight: "700" },
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    modalSheet: {
      backgroundColor: palette.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: "88%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    modalTitle: {
      color: palette.text,
      fontSize: 18,
      fontWeight: "700",
      flex: 1,
      marginRight: 8,
    },
    fieldLabel: {
      color: palette.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    detailMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },
    emptySmall: { color: palette.textSec, fontSize: 13, marginBottom: 8 },
    batchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: palette.surfaceAlt,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    batchInput: {
      backgroundColor: palette.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 10,
      height: 38,
      color: palette.text,
      fontSize: 15,
      width: 90,
    },
    batchUnit: { color: palette.textSec, fontSize: 13 },
    batchExpiry: { color: palette.textSec, fontSize: 12, marginTop: 4 },
    saveSmall: {
      backgroundColor: palette.brand,
      borderRadius: 10,
      paddingHorizontal: 16,
      height: 38,
      justifyContent: "center",
      alignItems: "center",
    },
    saveSmallText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    formInput: {
      backgroundColor: palette.surfaceAlt,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 14,
      height: 44,
      color: palette.text,
      fontSize: 15,
    },
    saveBtn: {
      backgroundColor: palette.brand,
      borderRadius: 12,
      height: 52,
      justifyContent: "center",
      alignItems: "center",
    },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: palette.surfaceAlt,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 14,
    },
    toggleLabel: { color: palette.text, fontSize: 14, fontWeight: "600" },
    toggleHint: { color: palette.textSec, fontSize: 12, marginTop: 2 },
    sectionDivider: {
      color: palette.textSec,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginTop: 8,
      marginBottom: 12,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    dateSheet: {
      backgroundColor: palette.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 32,
    },
    dateSheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
    },
    dateSheetTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
    dateSheetClear: { color: palette.textSec, fontSize: 15 },
    dateSheetDone: { color: palette.brand, fontSize: 15, fontWeight: "700" },
  });
}
