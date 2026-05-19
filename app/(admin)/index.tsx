import { C, ColorPalette, useColors } from '@/lib/constants';
import { watchInventoryItems } from '@/lib/firebase/inventory';
import { watchNotificationsForRole } from '@/lib/firebase/notifications';
import { FirestoreInventoryItem } from '@/lib/types/inventory';
import { AppNotification } from '@/lib/types/notification';
import { useAuthStore } from '@/store/auth';
import { Feather } from '@expo/vector-icons';
import { differenceInDays, format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Spinner } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Styles = ReturnType<typeof makeStyles>;

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [items, setItems] = useState<FirestoreInventoryItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const check = () => { if (++loaded >= 2) setIsLoading(false); };
    const unsubInv = watchInventoryItems((data) => { setItems(data); check(); });
    const unsubNotif = watchNotificationsForRole('admin', (data) => { setNotifications(data); check(); });
    return () => { unsubInv(); unsubNotif(); };
  }, []);

  const low = items.filter((i) => i.status === 'low');
  const out = items.filter((i) => i.status === 'out');
  const expiring = items.filter(
    (i) => i.expirationDate
      && differenceInDays(i.expirationDate, new Date()) <= 7
      && differenceInDays(i.expirationDate, new Date()) >= 0
  );
  const needsAction = low.length + out.length + expiring.length;

  const priorityIds = new Set<string>();
  const priorityItems: FirestoreInventoryItem[] = [];
  for (const item of [...out, ...low, ...expiring]) {
    if (!priorityIds.has(item.id)) {
      priorityIds.add(item.id);
      priorityItems.push(item);
    }
    if (priorityItems.length >= 6) break;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} tintColor={C.brand} />}
    >
      {/* ── Gradient Hero Header ── */}
      <LinearGradient
        colors={['#F97316', '#EA580C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.circle1} />
        <View style={styles.circle2} />

        <View style={styles.heroTop}>
          <View>
            <View style={styles.badge}>
              <Feather name="shield" size={10} color="#fff" />
              <Text style={styles.badgeText}>Admin control center</Text>
            </View>
            <Text style={styles.heroGreeting}>Good {getGreeting()},</Text>
            <Text style={styles.heroName}>{user?.fullName ?? 'Administrator'}</Text>
            <Text style={styles.heroSub}>Track stock health and manage your team.</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => router.push('/(admin)/profile')}
          >
            <Feather name="bell" size={20} color="rgba(255,255,255,0.9)" />
            {notifications.length > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <HeroStat label="Total" value={items.length} styles={styles} />
          <View style={styles.heroStatDivider} />
          <HeroStat label="Low Stock" value={low.length} styles={styles} />
          <View style={styles.heroStatDivider} />
          <HeroStat label="Out" value={out.length} styles={styles} />
          <View style={styles.heroStatDivider} />
          <HeroStat label="Expiring" value={expiring.length} styles={styles} />
        </View>

        <TouchableOpacity
          style={styles.aiBtn}
          onPress={() => router.push('/(admin)/forecasting')}
        >
          <Feather name="cpu" size={13} color={C.brand} />
          <Text style={styles.aiBtnText}>View AI Insights & Forecasting</Text>
          <Feather name="chevron-right" size={13} color={C.brand} />
        </TouchableOpacity>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>OVERVIEW</Text>
          <View style={styles.statsGrid}>
            <StatCard icon="package" label="Total Items" value={items.length} color={C.info}
              action="View All" onAction={() => router.push('/(admin)/inventory')} styles={styles} />
            <StatCard icon="alert-triangle" label="Low Stock" value={low.length} color={C.warning}
              action="Manage" onAction={() => router.push('/(admin)/inventory')} styles={styles} />
            <StatCard icon="clock" label="Expiring" value={expiring.length} color={C.brand}
              action="Check" onAction={() => router.push('/(admin)/inventory')} styles={styles} />
            <StatCard icon="x-circle" label="Out of Stock" value={out.length} color={C.danger}
              action="Approve" onAction={() => router.push('/(admin)/inventory')} styles={styles} />
          </View>

          {needsAction > 0 && (
            <View style={styles.alertBanner}>
              <Feather name="alert-circle" size={16} color={C.warning} />
              <Text style={styles.alertText}>
                {needsAction} item{needsAction !== 1 ? 's' : ''} need attention
              </Text>
            </View>
          )}

          {priorityItems.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>PRIORITY INVENTORY</Text>
                <TouchableOpacity onPress={() => router.push('/(admin)/inventory')}>
                  <Text style={styles.sectionAction}>View all</Text>
                </TouchableOpacity>
              </View>
              {priorityItems.map((item) => {
                const ds = getPriorityDisplayStatus(item);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.priorityCard}
                    onPress={() => router.push('/(admin)/inventory')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.priorityIconBox}>
                      <Feather name="package" size={20} color={C.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.priorityName}>{item.name}</Text>
                      <Text style={styles.priorityMeta}>{item.category} · {item.unit}</Text>
                      {item.expirationDate && (
                        <Text style={styles.priorityExpiry}>Exp: {format(item.expirationDate, 'MMM d')}</Text>
                      )}
                    </View>
                    <View style={styles.priorityRight}>
                      <Text style={styles.priorityQty}>{item.quantity} {item.unit}</Text>
                      <View style={[styles.statusPill, { backgroundColor: statusBg(ds) }]}>
                        <Text style={[styles.statusText, { color: statusColor(ds) }]}>
                          {statusLabel(ds)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {notifications.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 8, paddingHorizontal: 20 }]}>RECENT ALERTS</Text>
              {notifications.slice(0, 3).map((n) => (
                <View key={n.id} style={styles.notifCard}>
                  <View style={[styles.notifAccent, { backgroundColor: notifColor(n.type) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifMsg} numberOfLines={1}>{n.message}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function HeroStat({ label, value, styles }: { label: string; value: number; styles: Styles }) {
  return (
    <View style={styles.heroStatItem}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, displayValue, color, action, onAction, styles }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  displayValue?: string;
  color: string;
  action?: string;
  onAction?: () => void;
  styles: Styles;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Feather name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{displayValue ?? value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} style={[styles.actionChip, { borderColor: color + '55' }]}>
          <Text style={[styles.actionChipText, { color }]}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function notifColor(type: string) {
  if (type === 'low_stock') return C.warning;
  if (type === 'out_of_stock') return C.danger;
  if (type === 'expiry') return C.brand;
  if (type === 'inspection_alert') return C.info;
  return C.textSec;
}

function getPriorityDisplayStatus(item: FirestoreInventoryItem) {
  if (item.expirationDate) {
    const days = differenceInDays(item.expirationDate, new Date());
    if (days <= 7 && days >= 0) return 'expiring';
  }
  return item.status;
}

function statusLabel(s: string) {
  if (s === 'low') return 'LOW';
  if (s === 'expiring') return 'EXPIRING';
  if (s === 'out') return 'OUT';
  return 'IN STOCK';
}

function statusBg(s: string) {
  if (s === 'ok') return C.successSoft;
  if (s === 'low') return C.warningSoft;
  if (s === 'expiring') return C.infoSoft;
  return C.dangerSoft;
}

function statusColor(s: string) {
  if (s === 'ok') return C.success;
  if (s === 'low') return C.warning;
  if (s === 'expiring') return C.info;
  return C.danger;
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    content: { paddingBottom: 32 },

    heroCard: { marginHorizontal: 20, marginTop: 56, borderRadius: 20, padding: 20, overflow: 'hidden', marginBottom: 20 },
    circle1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -30 },
    circle2: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, left: 60 },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 8 },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    heroGreeting: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
    heroName: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 2 },
    heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
    notifBtn: { padding: 6, position: 'relative' },
    notifDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    heroStats: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: 12, marginBottom: 12 },
    heroStatItem: { flex: 1, alignItems: 'center' },
    heroStatValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
    heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
    heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
    aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
    aiBtnText: { color: C.brand, fontSize: 13, fontWeight: '700', flex: 1 },

    sectionTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10, marginTop: 8 },
    sectionAction: { color: C.brand, fontSize: 13, fontWeight: '600' },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, paddingHorizontal: 20 },
    statCard: {
      width: '47.5%',
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
      borderLeftWidth: 3,
      gap: 4,
    },
    statValue: { color: C.text, fontSize: 26, fontWeight: '700', marginTop: 4 },
    statLabel: { color: C.textSec, fontSize: 12 },
    actionChip: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
    actionChipText: { fontSize: 11, fontWeight: '700' },

    alertBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.warningSoft, borderRadius: 10, padding: 12, gap: 8, marginBottom: 8, borderWidth: 1, borderColor: C.warning + '40', marginHorizontal: 20 },
    alertText: { color: C.warning, fontSize: 13, fontWeight: '600' },

    priorityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 12, marginHorizontal: 20 },
    priorityIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    priorityName: { color: C.text, fontSize: 15, fontWeight: '700' },
    priorityMeta: { color: C.textSec, fontSize: 12, marginTop: 2 },
    priorityExpiry: { color: C.textSec, fontSize: 11, marginTop: 2 },
    priorityRight: { alignItems: 'flex-end', gap: 6 },
    priorityQty: { color: C.text, fontSize: 16, fontWeight: '800' },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },

    notifCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 12, marginHorizontal: 20 },
    notifAccent: { width: 4, height: 36, borderRadius: 2 },
    notifTitle: { color: C.text, fontSize: 13, fontWeight: '600' },
    notifMsg: { color: C.textSec, fontSize: 12, marginTop: 2 },

    center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  });
}
