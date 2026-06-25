import { useMemo, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Spinner } from "heroui-native";
import { generateForecast } from "@/lib/firebase/forecasting";
import { ForecastResult } from "@/lib/types/forecast";
import { fromBaseUnit, formatQuantity } from "@/lib/types/product";
import { C, useColors, ColorPalette } from "@/lib/constants";
import ScreenHeader from "@/components/ScreenHeader";

const WINDOW_DAYS = 30;

// Color buckets match the admin web forecast page exactly.
function bucketColor(daysLeft: number | null, palette: ColorPalette): string {
  if (daysLeft === null) return palette.textSec;
  if (daysLeft <= 3) return palette.danger;
  if (daysLeft <= 7) return palette.warning;
  return palette.success;
}

function daysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "-";
  if (daysLeft <= 0) return "Out now";
  return `~${daysLeft} days`;
}

export default function StaffForecastingScreen() {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [rows, setRows] = useState<ForecastResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      setRows(await generateForecast());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    let urgent = 0;
    let warn = 0;
    let safe = 0;
    rows.forEach((r) => {
      if (r.daysLeft === null) return;
      if (r.daysLeft <= 3) urgent += 1;
      else if (r.daysLeft <= 7) warn += 1;
      else safe += 1;
    });
    return { urgent, warn, safe };
  }, [rows]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Forecasting & Insights"
        right={
          <TouchableOpacity onPress={load} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={18} color={palette.text} />
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Feather name="trending-up" size={40} color={palette.border} />
          <Text style={styles.emptyText}>
            No ingredient consumption tracked in the last {WINDOW_DAYS} days.
            Prepare some recipes to generate forecast data.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={load}
              tintColor={palette.brand}
            />
          }
        >
          <Text style={styles.subtitle}>
            Based on {WINDOW_DAYS} days of production history - how long current
            stock will last at the current consumption rate.
          </Text>

          {/* Summary bar */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <View
                style={[styles.summaryDot, { backgroundColor: palette.danger }]}
              />
              <Text style={[styles.summaryText, { color: palette.textSec }]}>
                {counts.urgent} running out in ≤3 days
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <View
                style={[styles.summaryDot, { backgroundColor: palette.warning }]}
              />
              <Text style={[styles.summaryText, { color: palette.textSec }]}>
                {counts.warn} in ≤7 days
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <View
                style={[styles.summaryDot, { backgroundColor: palette.success }]}
              />
              <Text style={[styles.summaryText, { color: palette.textSec }]}>
                {counts.safe} with 7+ days
              </Text>
            </View>
          </View>

          {/* Cards (one per forecast row) */}
          {rows.map((r) => {
            const color = bucketColor(r.daysLeft, palette);
            return (
              <View
                key={r.id}
                style={[
                  styles.card,
                  { borderLeftWidth: 3, borderLeftColor: color },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{r.name}</Text>
                    <Text style={styles.cardCategory}>{r.category}</Text>
                  </View>
                  <View
                    style={[styles.labelBadge, { backgroundColor: color + "22" }]}
                  >
                    <Text style={[styles.labelText, { color }]}>
                      {daysLabel(r.daysLeft)}
                    </Text>
                  </View>
                </View>

                <View style={styles.statRow}>
                  <Stat
                    label="On hand"
                    value={formatQuantity(r.onHand, r.displayUnit)}
                    palette={palette}
                  />
                  <Stat
                    label={`Avg use / day (${WINDOW_DAYS}d)`}
                    value={`${fromBaseUnit(r.avgPerDayBase, r.displayUnit).toFixed(2)} ${r.displayUnit}`}
                    palette={palette}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: ColorPalette;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.text, fontSize: 15, fontWeight: "700" }}>
        {value}
      </Text>
      <Text style={{ color: palette.textSec, fontSize: 11, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    refreshBtn: {
      padding: 8,
      backgroundColor: C.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
      gap: 12,
      paddingHorizontal: 20,
    },
    emptyText: { color: C.textSec, fontSize: 14, textAlign: "center" },
    subtitle: {
      color: C.textSec,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    summaryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    summaryDot: { width: 7, height: 7, borderRadius: 4 },
    summaryText: { fontSize: 12, fontWeight: "500" },
    card: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    cardTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
    cardCategory: { color: C.textSec, fontSize: 12, marginTop: 2 },
    labelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    labelText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
    statRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingTop: 12,
      gap: 12,
    },
  });
}
