import { useMemo, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { generateAvailabilityInsights } from '@/lib/firebase/ai-insights';
import { AiAvailabilityInsight, AvailabilityLabel } from '@/lib/types/forecast';
import { C, useColors, ColorPalette } from '@/lib/constants';

const LABEL_COLOR: Record<AvailabilityLabel, string> = {
  Unavailable: C.danger,
  'At Risk': C.warning,
  Limited: C.brand,
  Available: C.success,
};

const LABEL_DESC: Record<AvailabilityLabel, string> = {
  Unavailable: 'Out of stock',
  'At Risk': 'Covers <25% of weekly demand',
  Limited: 'Covers <60% of weekly demand',
  Available: 'Enough for the week',
};

const LEGEND_LABELS: AvailabilityLabel[] = ['Unavailable', 'At Risk', 'Limited', 'Available'];

export default function ForecastingScreen() {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [insights, setInsights] = useState<AiAvailabilityInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      setInsights(await generateAvailabilityInsights());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<AvailabilityLabel, number> = { Unavailable: 0, 'At Risk': 0, Limited: 0, Available: 0 };
    insights.forEach((i) => { c[i.availabilityLabel] += 1; });
    return c;
  }, [insights]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Forecasting & Insights</Text>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={palette.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : insights.length === 0 ? (
        <View style={styles.center}>
          <Feather name="trending-up" size={40} color={palette.border} />
          <Text style={styles.emptyText}>No forecast data yet. Add inventory logs to generate forecasts.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={palette.brand} />}
        >
          {/* Summary bar */}
          <View style={styles.summaryRow}>
            {(LEGEND_LABELS.filter((l) => counts[l] > 0) as AvailabilityLabel[]).map((label) => (
              <View key={label} style={styles.summaryChip}>
                <View style={[styles.summaryDot, { backgroundColor: LABEL_COLOR[label] }]} />
                <Text style={[styles.summaryText, { color: palette.textSec }]}>
                  {counts[label]} {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Cards */}
          {insights.map((ins) => (
            <View
              key={ins.itemId}
              style={[styles.card, { borderLeftWidth: 3, borderLeftColor: LABEL_COLOR[ins.availabilityLabel] }]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{ins.itemName}</Text>
                <View style={[styles.labelBadge, { backgroundColor: LABEL_COLOR[ins.availabilityLabel] + '22' }]}>
                  <Text style={[styles.labelText, { color: LABEL_COLOR[ins.availabilityLabel] }]}>
                    {ins.availabilityLabel.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.message}>{ins.message}</Text>

              <View style={styles.statRow}>
                <Stat label="Current" helper="in stock" value={String(ins.currentQuantity)} palette={palette} />
                <Stat label="Avg/Day" helper="per day" value={String(ins.averageDailyUsage)} palette={palette} />
                <Stat label="7d Need" helper="this week" value={String(ins.predictedWeeklyDemand)} palette={palette} />
                <Stat
                  label="Restock"
                  helper="to add"
                  value={ins.recommendedRestock > 0 ? `+${ins.recommendedRestock}` : '—'}
                  accent={ins.recommendedRestock > 0}
                  palette={palette}
                />
              </View>
            </View>
          ))}

          {/* Collapsible legend */}
          <TouchableOpacity style={styles.legendToggle} onPress={() => setLegendOpen((v) => !v)} activeOpacity={0.7}>
            <Feather name="info" size={14} color={palette.textSec} />
            <Text style={styles.legendToggleText}>What do these labels mean?</Text>
            <Feather name={legendOpen ? 'chevron-up' : 'chevron-down'} size={14} color={palette.textSec} />
          </TouchableOpacity>

          {legendOpen && (
            <View style={styles.legendBox}>
              {LEGEND_LABELS.map((label) => (
                <View key={label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: LABEL_COLOR[label] }]} />
                  <Text style={[styles.legendLabel, { color: LABEL_COLOR[label] }]}>{label}</Text>
                  <Text style={styles.legendDesc}>{LABEL_DESC[label]}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({
  label, helper, value, accent, palette,
}: {
  label: string; helper: string; value: string; accent?: boolean; palette: ColorPalette;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: accent ? C.warning : palette.text, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: palette.textSec, fontSize: 11, marginTop: 1 }}>{label}</Text>
      <Text style={{ color: palette.textSec, fontSize: 10, opacity: 0.6 }}>{helper}</Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
    refreshBtn: { padding: 8, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 12, paddingHorizontal: 20 },
    emptyText: { color: C.textSec, fontSize: 14, textAlign: 'center' },
    summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    summaryDot: { width: 7, height: 7, borderRadius: 4 },
    summaryText: { fontSize: 12, fontWeight: '500' },
    card: { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', flex: 1 },
    labelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    labelText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
    message: { color: C.textSec, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    statRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, gap: 4 },
    legendToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 14 },
    legendToggleText: { color: C.textSec, fontSize: 13 },
    legendBox: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12, gap: 10 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { fontSize: 13, fontWeight: '600', width: 90 },
    legendDesc: { color: C.textSec, fontSize: 12, flex: 1 },
  });
}
