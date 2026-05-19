import { EmptyState } from '@/components/EmptyState';
import { Toast } from '@/components/Toast';
import { C, useColors, ColorPalette } from '@/lib/constants';
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

function notifIcon(type: NotificationType): keyof typeof Feather.glyphMap {
  switch (type) {
    case 'low_stock': return 'alert-triangle';
    case 'out_of_stock': return 'x-circle';
    case 'expiry': return 'clock';
    case 'inspection_alert': return 'clipboard';
    case 'recipe_prepared': return 'book-open';
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
    default: return C.textSec;
  }
}

export default function StaffNotifications() {
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    const unsub = watchNotificationsForRole('staff', (d) => { setNotifications(d); setIsLoading(false); });
    return unsub;
  }, []);

  async function handleMarkAll() {
    if (notifications.length === 0) return;
    await markAllAsRead('staff');
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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleMarkAll}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
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
                  <Text style={styles.title}>{n.title}</Text>
                  <Text style={styles.message} numberOfLines={2}>{n.message}</Text>
                  {n.timestamp && (
                    <Text style={styles.time}>{format(n.timestamp, 'MMM d · h:mm a')}</Text>
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

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
    markAllText: { color: C.brand, fontSize: 13, fontWeight: '600' },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
    card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    title: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
    message: { color: C.textSec, fontSize: 13, lineHeight: 18 },
    time: { color: C.textSec, fontSize: 11, marginTop: 6 },
    typeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
    swipeAction: { justifyContent: 'center', alignItems: 'center', marginBottom: 10, marginRight: 20 },
    swipeBtn: { backgroundColor: C.success, borderRadius: 14, width: 70, height: '100%', justifyContent: 'center', alignItems: 'center', gap: 4 },
    swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  });
}
