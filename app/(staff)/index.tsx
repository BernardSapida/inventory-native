import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spinner } from 'heroui-native';
import { watchInventoryItems } from '@/lib/firebase/inventory';
import { watchRecipes } from '@/lib/firebase/recipes';
import { FirestoreInventoryItem } from '@/lib/types/inventory';
import { RecipeModel } from '@/lib/types/recipe';
import { C, useColors, ColorPalette } from '@/lib/constants';

type Styles = ReturnType<typeof makeStyles>;

export default function StaffHome() {
  const router = useRouter();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [items, setItems] = useState<FirestoreInventoryItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const check = () => { if (++loaded >= 2) setIsLoading(false); };
    const unsub1 = watchInventoryItems((d) => { setItems(d); check(); });
    const unsub2 = watchRecipes((d) => { setRecipes(d); check(); });
    return () => { unsub1(); unsub2(); };
  }, []);

  const lowItems = items.filter((i) => i.status === 'low');
  const outItems = items.filter((i) => i.status === 'out');

  const priorityIds = new Set<string>();
  const priorityItems: FirestoreInventoryItem[] = [];
  for (const item of [...outItems, ...lowItems]) {
    if (!priorityIds.has(item.id)) {
      priorityIds.add(item.id);
      priorityItems.push(item);
    }
    if (priorityItems.length >= 6) break;
  }

  const latestRecipe = recipes.length > 0 ? recipes[0] : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} tintColor={C.brand} />}
    >
      <Text style={styles.appBarTitle}>Staff Home</Text>

      {/* ── Dashboard Header Card ── */}
      <LinearGradient
        colors={['#EA580C', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <View style={styles.decCircle1} />
        <View style={styles.decCircle2} />
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Staff workspace</Text>
            </View>
          </View>
          <View style={styles.headerIconBox}>
            <Feather name="package" size={24} color="#fff" />
          </View>
        </View>
        <View style={{ height: 18 }} />
        <Text style={styles.headerTitle}>Today's stock status</Text>
        <Text style={styles.headerSubtitle}>
          Update counts quickly, review shortages, and keep kitchen prep moving without delays.
        </Text>
        <Text style={styles.headerFootnote}>Use cards below to jump into the next task.</Text>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <>
          {/* ── Stats Grid ── */}
          <View style={styles.statsGrid}>
            <StatCard
              icon="package"
              iconColor={C.info}
              iconBg={C.infoSoft}
              value={items.length}
              title="Tracked Items"
              subtitle="Last updated from live stock records"
              styles={styles}
            />
            <StatCard
              icon="alert-triangle"
              iconColor={C.warning}
              iconBg={C.warningSoft}
              value={lowItems.length}
              title="Low Stock"
              subtitle={lowItems.length === 0 ? 'No urgent low-stock items' : lowItems.slice(0, 2).map((e) => e.name).join(', ')}
              btnLabel="View Stock"
              btnColor={C.warning}
              btnBg={C.warningSoft}
              onPress={() => router.push('/(staff)/inventory')}
              styles={styles}
            />
            <StatCard
              icon="x-circle"
              iconColor={C.danger}
              iconBg={C.dangerSoft}
              value={outItems.length}
              title="Out of Stock"
              subtitle={outItems.length === 0 ? 'No items currently out' : outItems.slice(0, 2).map((e) => e.name).join(', ')}
              btnLabel="View Stock"
              btnColor={C.danger}
              btnBg={C.dangerSoft}
              onPress={() => router.push('/(staff)/inventory')}
              styles={styles}
            />
            <StatCard
              icon="book-open"
              iconColor={C.brand}
              iconBg={C.brandSoft}
              value={recipes.length}
              title="Recipes"
              subtitle={recipes.length === 0 ? 'No recipes yet' : `Latest: ${latestRecipe?.name ?? '-'}`}
              btnLabel={recipes.length === 0 ? '+ Add Recipe' : 'View Recipes'}
              btnColor={C.brand}
              btnBg={C.brandSoft}
              onPress={() => router.push('/(staff)/recipes')}
              styles={styles}
            />
          </View>

          {/* ── Urgent Inventory ── */}
          <Text style={styles.sectionTitle}>Urgent inventory</Text>
          <View style={{ height: 12 }} />

          {priorityItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="check-circle" size={24} color={C.success} />
              <Text style={styles.emptyTitle}>Everything looks good</Text>
              <Text style={styles.emptySubtitle}>No urgent stock issues right now.</Text>
            </View>
          ) : (
            priorityItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.stockCard}
                onPress={() => router.push('/(staff)/inventory')}
                activeOpacity={0.8}
              >
                <View style={styles.stockIconBox}>
                  <Feather name="package" size={20} color={C.brand} />
                </View>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockName}>{item.name}</Text>
                  <Text style={styles.stockMeta}>{item.category} • {item.unit}</Text>
                </View>
                <View style={styles.stockTrailing}>
                  <Text style={styles.stockQty}>
                    {Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)} {item.unit}
                  </Text>
                  <View style={{ height: 8 }} />
                  <View style={[styles.statusPill, { backgroundColor: item.status === 'out' ? C.dangerSoft : C.warningSoft }]}>
                    <Text style={[styles.statusText, { color: item.status === 'out' ? C.danger : C.warning }]}>
                      {item.status === 'out' ? 'Out of Stock' : 'Low Stock'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

type StatCardProps = {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBg: string;
  value: number;
  title: string;
  subtitle: string;
  btnLabel?: string;
  btnColor?: string;
  btnBg?: string;
  onPress?: () => void;
  styles: Styles;
};

function StatCard({ icon, iconColor, iconBg, value, title, subtitle, btnLabel, btnColor, btnBg, onPress, styles }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statSubtitle} numberOfLines={2}>{subtitle}</Text>
      {btnLabel && onPress && (
        <TouchableOpacity
          style={[styles.statBtn, { backgroundColor: btnBg }]}
          onPress={onPress}
          activeOpacity={0.8}
        >
          <Text style={[styles.statBtnText, { color: btnColor }]}>{btnLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    content: { padding: 20, paddingTop: 56, paddingBottom: 32 },

    appBarTitle: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 20 },

    headerCard: { borderRadius: 26, padding: 20, overflow: 'hidden', marginBottom: 20 },
    decCircle1: {
      position: 'absolute', width: 120, height: 120, borderRadius: 60,
      backgroundColor: 'rgba(255,255,255,0.08)', right: -12, top: -12,
    },
    decCircle2: {
      position: 'absolute', width: 72, height: 72, borderRadius: 36,
      backgroundColor: 'rgba(255,255,255,0.06)', right: 48, bottom: -20,
    },
    headerTop: { flexDirection: 'row', alignItems: 'flex-start' },
    badge: {
      alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
      backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999,
    },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    headerIconBox: {
      width: 58, height: 58, borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 28 },
    headerSubtitle: { color: 'rgba(255,247,237,1)', fontSize: 13, lineHeight: 19, marginTop: 8 },
    headerFootnote: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600', marginTop: 14 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    statCard: {
      width: '47.5%', backgroundColor: C.surface, borderRadius: 22,
      padding: 14, borderWidth: 1, borderColor: C.border,
    },
    statIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    statValue: { color: C.text, fontSize: 24, fontWeight: '800' },
    statTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
    statSubtitle: { color: C.textSec, fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 4 },
    statBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center' },
    statBtnText: { fontSize: 12, fontWeight: '700' },

    sectionTitle: { color: C.text, fontSize: 17, fontWeight: '700' },

    emptyState: {
      alignItems: 'center', paddingVertical: 32, backgroundColor: C.successSoft,
      borderRadius: 16, borderWidth: 1, borderColor: C.success + '40', gap: 8,
    },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySubtitle: { color: C.textSec, fontSize: 13 },

    stockCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 10,
    },
    stockIconBox: {
      width: 52, height: 52, borderRadius: 16,
      backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center',
    },
    stockInfo: { flex: 1, marginLeft: 14 },
    stockName: { color: C.text, fontSize: 16, fontWeight: '700' },
    stockMeta: { color: C.textSec, fontSize: 13, marginTop: 4 },
    stockTrailing: { alignItems: 'flex-end' },
    stockQty: { color: C.text, fontSize: 17, fontWeight: '800' },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },

    center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  });
}
