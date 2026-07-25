import { EmptyState } from '@/components/EmptyState';
import { Toast } from '@/components/Toast';
import { C, useColors, ColorPalette } from '@/lib/constants';
import ScreenHeader from '@/components/ScreenHeader';
import { markAllAsRead, markAsRead, watchNotificationsForRole } from '@/lib/firebase/notifications';
import { AppNotification, NotificationType } from '@/lib/types/notification';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Spinner } from 'heroui-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

// ─── Notification helpers ──────────────────────────────────────────────────

function notifIcon(type: NotificationType): keyof typeof Feather.glyphMap {
  switch (type) {
    case 'low_stock': return 'alert-triangle';
    case 'out_of_stock': return 'x-circle';
    case 'expiry': return 'clock';
    case 'inspection_alert': return 'clipboard';
    case 'recipe_prepared': return 'book-open';
    case 'staff_login': return 'log-in';
    case 'staff_logout': return 'log-out';
    default: return 'bell';
  }
}

function notifColor(type: NotificationType) {
  switch (type) {
    case 'low_stock': return C.warning;
    case 'out_of_stock': return C.danger;
    case 'expiry': return C.brand;
    case 'inspection_alert': return C.info;
    case 'recipe_prepared': return C.success;
    case 'staff_login': return C.success;
    case 'staff_logout': return C.textSec;
    default: return C.textSec;
  }
}

interface Props {
  role: 'staff' | 'admin';
}

export default function NotificationsScreen({ role }: Props) {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    const unsub = watchNotificationsForRole(role, (d) => {
      setNotifications(d);
      setLoading(false);
    });
    return unsub;
  }, [role]);

  async function handleMarkAll() {
    if (notifications.length === 0) return;
    await markAllAsRead(role);
    showToast('All notifications marked as read');
  }

  async function handleMarkOne(n: AppNotification) {
    await markAsRead(n.id);
    showToast('Marked as read', 'info');
  }

  function renderRightActions(progress: Animated.AnimatedInterpolation<number>, n: AppNotification) {
    const trans = progress.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
    return (
      <Animated.View style={[styles.swipeAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity style={styles.swipeBtn} onPress={() => handleMarkOne(n)}>
          <Feather name="check" size={20} color="#fff" />
          <Text style={styles.swipeBtnText}>Read</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const unreadCount = notifications.length;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Notifications"
        right={
          unreadCount > 0
            ? <TouchableOpacity onPress={handleMarkAll}><Text style={styles.markAllText}>Mark all read</Text></TouchableOpacity>
            : undefined
        }
      />

      {loading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={notifications.length === 0 ? { flex: 1 } : styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon="bell-off" title="All clear!" subtitle="No unread notifications right now" />
          }
          renderItem={({ item: n }) => (
            <Swipeable
              renderRightActions={(progress) => renderRightActions(progress, n)}
              overshootRight={false}
            >
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleMarkOne(n)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: notifColor(n.type) + '22' }]}>
                  <Feather name={notifIcon(n.type)} size={18} color={notifColor(n.type)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{n.title}</Text>
                  <Text style={styles.cardMessage} numberOfLines={2}>{n.message}</Text>
                  {n.timestamp && (
                    <Text style={styles.cardTime}>{format(n.timestamp, 'MMM d · h:mm a')}</Text>
                  )}
                </View>
                <View style={[styles.typeDot, { backgroundColor: notifColor(n.type) }]} />
              </TouchableOpacity>
            </Swipeable>
          )}
        />
      )}

      {toast && (
        <Toast message={toast.msg} type={toast.type} visible onHide={() => setToast(null)} />
      )}
    </View>
  );
}

function makeStyles(palette: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    markAllText: { color: C.brand, fontSize: 13, fontWeight: '600' },
    list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
    center: { justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 60 },
    card: {
      flexDirection: 'row', alignItems: 'flex-start', backgroundColor: palette.surface,
      borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: palette.border, gap: 12,
    },
    iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    cardTitle: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
    cardMessage: { color: palette.textSec, fontSize: 13, lineHeight: 18 },
    cardTime: { color: palette.textSec, fontSize: 11, marginTop: 6 },
    typeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
    swipeAction: { justifyContent: 'center', alignItems: 'center', marginBottom: 10, marginRight: 20 },
    swipeBtn: {
      backgroundColor: C.success, borderRadius: 14, width: 70, height: '100%',
      justifyContent: 'center', alignItems: 'center', gap: 4,
    },
    swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  });
}
