import { C, useColors, ColorPalette } from '@/lib/constants';
import ScreenHeader from '@/components/ScreenHeader';
import { watchInventory } from '@/lib/firebase/products';
import { formatQuantity, ProductWithBatches } from '@/lib/types/product';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// ─── Alert item (inventory-derived) ───────────────────────────────────────

interface AlertItem {
  id: string;
  title: string;
  detail: string;
  severity: number;
  color: 'danger' | 'warning';
  icon: keyof typeof Feather.glyphMap;
}

function buildAlerts(rows: ProductWithBatches[]): AlertItem[] {
  const out: AlertItem[] = [];
  const today = new Date();

  for (const r of rows) {
    if (r.status === 'out') {
      out.push({
        id: `out-${r.product.id}`,
        title: `${r.product.name} is out of stock`,
        detail: r.product.category,
        color: 'danger',
        severity: 3,
        icon: 'x-circle',
      });
    } else if (r.status === 'low') {
      out.push({
        id: `low-${r.product.id}`,
        title: `${r.product.name} is running low`,
        detail: `${formatQuantity(r.onHand, r.product.displayUnit)} on hand`,
        color: 'warning',
        severity: 1,
        icon: 'alert-triangle',
      });
    }

    for (const b of r.batches) {
      if (!b.expirationDate) continue;
      const expDate = b.expirationDate.toDate();
      // ceil-based days-left, ≤7d window — keep in sync with smartstock-admin
      // (src/features/expiry/expiry.ts daysLeft + AlertsView), so both apps count alerts identically.
      const daysLeft = Math.ceil((expDate.getTime() - today.getTime()) / 86_400_000);

      if (daysLeft < 0) {
        out.push({
          id: `exp-${b.id}`,
          title: `${r.product.name} batch expired`,
          detail: `${Math.abs(daysLeft)}d ago · ${formatQuantity(b.quantity, r.product.displayUnit)}`,
          color: 'danger',
          severity: 3,
          icon: 'clock',
        });
      } else if (daysLeft <= 7) {
        out.push({
          id: `exp-${b.id}`,
          title: `${r.product.name} batch expiring soon`,
          detail: `${daysLeft}d left · ${formatQuantity(b.quantity, r.product.displayUnit)}`,
          color: 'warning',
          severity: 2,
          icon: 'clock',
        });
      }
    }
  }

  return out.sort((a, b) => b.severity - a.severity);
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [rows, setRows] = useState<ProductWithBatches[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = watchInventory((d) => {
      setRows(d);
      setLoading(false);
    });
    return unsub;
  }, []);

  const alerts = useMemo(() => buildAlerts(rows), [rows]);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Stock Alerts" />

      {loading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : alerts.length === 0 ? (
        <View style={[styles.center, { flex: 1 }]}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: C.successSoft, width: 64, height: 64, borderRadius: 20 },
            ]}
          >
            <Feather name="check-circle" size={32} color={C.success} />
          </View>
          <Text style={styles.emptyTitle}>All Good!</Text>
          <Text style={styles.emptySubtitle}>No stock or expiry alerts right now.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {alerts.map((a) => {
            const accentColor = a.color === 'danger' ? C.danger : C.warning;
            const bgColor = a.color === 'danger' ? C.dangerSoft : C.warningSoft;
            return (
              <View key={a.id} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
                <View style={[styles.iconWrap, { backgroundColor: bgColor }]}>
                  <Feather name={a.icon} size={18} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{a.title}</Text>
                  <Text style={styles.cardMessage}>{a.detail}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: bgColor }]}>
                  <Text style={[styles.badgeText, { color: accentColor }]}>
                    {a.color === 'danger' ? 'URGENT' : 'WARNING'}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(palette: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
    center: { justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 60 },
    emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 },
    emptySubtitle: { color: palette.textSec, fontSize: 13, textAlign: 'center' },
    card: {
      flexDirection: 'row', alignItems: 'flex-start', backgroundColor: palette.surface,
      borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: palette.border, gap: 12,
    },
    iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    cardTitle: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
    cardMessage: { color: palette.textSec, fontSize: 13, lineHeight: 18 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
    badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  });
}
