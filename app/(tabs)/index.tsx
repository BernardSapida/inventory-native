import type { InventoryItem } from "@/lib/api";
import { useAppDialog } from "@/lib/dialog";
import { useInventoryStore } from "@/store/inventory";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Spinner } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const C = {
  bg: "#12151C",
  surface: "#1C2030",
  brand: "#F97316",
  brandIconBg: "rgba(249,115,22,0.15)",
  brandIcon: "#FB923C",
  text: "#FFFFFF",
  textSec: "#8A90A2",
  divider: "rgba(255,255,255,0.07)",
  inStockBg: "rgba(34,197,94,0.12)",
  inStockBorder: "rgba(34,197,94,0.4)",
  inStockText: "#22C55E",
  expiringBg: "rgba(249,115,22,0.12)",
  expiringBorder: "rgba(249,115,22,0.4)",
  expiringText: "#F97316",
  purple: "#7C3AED",
};

const FILTER_CHIPS = ["All", "General", "Protein", "Dry Goods"] as const;

function formatExpiry(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

function getStatus(item: InventoryItem): "IN STOCK" | "EXPIRING" {
  if (!item.expirationDate) return "IN STOCK";
  const daysLeft =
    (new Date(item.expirationDate).getTime() - Date.now()) / 86_400_000;
  return daysLeft <= 30 ? "EXPIRING" : "IN STOCK";
}

export default function StockManagementScreen() {
  const router = useRouter();
  const { items, isLoading, error, fetchInventory, removeItem } =
    useInventoryStore();
  const { showConfirm } = useAppDialog();
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] =
    useState<(typeof FILTER_CHIPS)[number]>("All");

  useEffect(() => {
    fetchInventory();
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search],
  );

  const handleDelete = (id: number, name: string) => {
    showConfirm(
      "Delete Item",
      `Remove "${name}" from inventory?`,
      () => removeItem(id),
      "Delete",
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Stock Management</Text>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={C.textSec} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search item"
            placeholderTextColor={C.textSec}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={16} color={C.textSec} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {FILTER_CHIPS.map((chip) => {
            const active = chip === activeChip;
            return (
              <TouchableOpacity
                key={chip}
                onPress={() => setActiveChip(chip)}
                style={[
                  styles.chip,
                  active ? styles.chipActive : styles.chipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    active ? styles.chipTextActive : styles.chipTextInactive,
                  ]}
                >
                  {chip}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Stock list */}
        {isLoading ? (
          <View style={styles.center}>
            <Spinner size="lg" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Could not reach server</Text>
            <Text style={styles.errorDetail}>{error}</Text>
            <TouchableOpacity onPress={fetchInventory} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No items recorded yet</Text>
          </View>
        ) : (
          <View>
            {filtered.map((item) => {
              const status = getStatus(item);
              const isExpiring = status === "EXPIRING";
              return (
                <TouchableOpacity
                  key={item.id}
                  onLongPress={() => handleDelete(item.id, item.name)}
                  style={styles.itemRow}
                  activeOpacity={0.7}
                >
                  <View style={styles.iconBox}>
                    <Feather name="archive" size={22} color={C.brandIcon} />
                  </View>

                  <View style={styles.middle}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name || "-"}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.category || "-"} · {item.unit || "-"}
                    </Text>
                    <Text style={styles.itemExpiry}>
                      {item.expirationDate
                        ? `Expiry: ${formatExpiry(item.expirationDate)}`
                        : "No expiry date"}
                    </Text>
                  </View>

                  <View style={styles.right}>
                    <Text style={styles.itemQty}>
                      {item.quantity ?? "-"} {item.unit || ""}
                    </Text>
                    <View
                      style={
                        isExpiring ? styles.badgeExpiring : styles.badgeInStock
                      }
                    >
                      <Text
                        style={
                          isExpiring
                            ? styles.badgeTextExpiring
                            : styles.badgeTextInStock
                        }
                      >
                        {status}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* AI Scan FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/camera")}
        activeOpacity={0.85}
      >
        <Feather name="camera" size={18} color={C.text} />
        <Text style={styles.fabLabel}>AI Scan</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
    gap: 12,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  screenTitle: { fontSize: 20, fontWeight: "700", color: C.text },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text },

  chipsRow: { gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  chipActive: { backgroundColor: C.brand },
  chipInactive: { backgroundColor: C.surface },
  chipText: { fontSize: 13 },
  chipTextActive: { color: C.text, fontWeight: "700" },
  chipTextInactive: { color: C.textSec, fontWeight: "500" },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.brandIconBg,
    alignItems: "center",
    justifyContent: "center",
  },
  middle: { flex: 1, marginLeft: 12, gap: 3 },
  itemName: { fontSize: 15, fontWeight: "600", color: C.text },
  itemMeta: { fontSize: 12, color: C.textSec },
  itemExpiry: { fontSize: 11, color: C.textSec },
  right: { alignItems: "flex-end", gap: 4 },
  itemQty: { fontSize: 14, fontWeight: "600", color: C.text },

  badgeInStock: {
    backgroundColor: C.inStockBg,
    borderWidth: 1,
    borderColor: C.inStockBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeExpiring: {
    backgroundColor: C.expiringBg,
    borderWidth: 1,
    borderColor: C.expiringBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeTextInStock: { fontSize: 11, fontWeight: "700", color: C.inStockText },
  badgeTextExpiring: { fontSize: 11, fontWeight: "700", color: C.expiringText },

  center: { paddingTop: 80, alignItems: "center", gap: 8 },
  emptyText: { color: C.textSec, fontSize: 15 },
  errorText: { color: "#dc2626", fontSize: 15, fontWeight: "600" },
  errorDetail: { color: C.textSec, fontSize: 12, textAlign: "center" },
  retryBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.surface,
  },
  retryText: { color: C.text, fontSize: 14 },

  fab: {
    position: "absolute",
    bottom: 48,
    right: 16,
    backgroundColor: C.purple,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: C.purple,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabLabel: { fontSize: 14, fontWeight: "600", color: C.text },
});
