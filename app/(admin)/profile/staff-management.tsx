import { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useAppDialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Spinner, Select } from 'heroui-native';
import { watchActiveStaff, setUserActiveStatus, archiveStaff, approveUser, rejectUser } from '@/lib/firebase/users';
import { AppUser } from '@/lib/types/user';
import { useColors, ColorPalette } from '@/lib/constants';

type DisplayStatus = 'pending' | 'rejected' | 'active' | 'inactive';

function displayStatus(s: AppUser): DisplayStatus {
  if (s.status === 'pending') return 'pending';
  if (s.status === 'rejected') return 'rejected';
  return s.isActive ? 'active' : 'inactive';
}

const STATUS_ORDER: Record<DisplayStatus, number> = { pending: 0, active: 1, inactive: 2, rejected: 3 };

type StatusFilterKey = 'all' | DisplayStatus;

const STATUS_FILTERS: { value: StatusFilterKey; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'rejected', label: 'Rejected' },
];

export default function StaffManagement() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showConfirm } = useAppDialog();
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');

  useEffect(() => {
    const unsub = watchActiveStaff((data) => { setStaff(data); setIsLoading(false); });
    return unsub;
  }, []);

  async function toggleActive(s: AppUser) {
    const action = s.isActive ? 'deactivate' : 'activate';
    showConfirm(
      `${s.isActive ? 'Deactivate' : 'Activate'} Staff`,
      `${action} ${s.fullName}?`,
      () => setUserActiveStatus(s.uid, !s.isActive),
      action.charAt(0).toUpperCase() + action.slice(1),
    );
  }

  async function handleArchive(s: AppUser) {
    showConfirm('Archive Staff', `Archive ${s.fullName}? They will lose app access.`, () => archiveStaff(s.uid), 'Archive');
  }

  async function handleApprove(s: AppUser) {
    showConfirm('Approve Staff', `Approve ${s.fullName}? They will be able to sign in.`, () => approveUser(s.uid), 'Approve');
  }

  async function handleReject(s: AppUser) {
    showConfirm('Reject Staff', `Reject ${s.fullName}?`, () => rejectUser(s.uid), 'Reject');
  }

  const activeCount = staff.filter((s) => s.isActive).length;
  // shiftOn now means "currently logged in / using the app" -- set automatically
  // on login and cleared on sign-out, no manual on-duty toggle.
  const onlineCount = staff.filter((s) => s.shiftOn).length;

  const visibleStaff = useMemo(() => {
    const list = statusFilter === 'all' ? staff : staff.filter((s) => displayStatus(s) === statusFilter);
    return [...list].sort((a, b) => {
      const diff = STATUS_ORDER[displayStatus(a)] - STATUS_ORDER[displayStatus(b)];
      return diff !== 0 ? diff : a.fullName.localeCompare(b.fullName);
    });
  }, [staff, statusFilter]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/profile')} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Management</Text>
        <View style={{ width: 28 }} />
      </View>

      {!isLoading && (
        <View style={styles.summaryCard}>
          <SummaryItem label="Total" value={staff.length} C={C} />
          <View style={styles.summaryDivider} />
          <SummaryItem label="Active" value={activeCount} C={C} />
          <View style={styles.summaryDivider} />
          <SummaryItem label="Online" value={onlineCount} C={C} />
        </View>
      )}

      {!isLoading && (
        <View style={styles.filterRow}>
          <Select
            value={STATUS_FILTERS.find((f) => f.value === statusFilter)}
            onValueChange={(opt) => setStatusFilter((opt as { value: StatusFilterKey }).value)}
          >
            <Select.Trigger style={styles.selectTrigger}>
              <Select.Value style={styles.selectValue} placeholder="All statuses" />
              <Select.TriggerIndicator iconProps={{ color: C.textSec, size: 16 }} />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="popover" width="trigger">
                {STATUS_FILTERS.map((f) => (
                  <Select.Item key={f.value} value={f.value} label={f.label} />
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}><Spinner size="lg" /></View>
      ) : (
        <FlatList
          data={visibleStaff}
          keyExtractor={(s) => s.uid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="users" size={40} color={C.border} />
              <Text style={styles.emptyText}>No staff match this filter</Text>
            </View>
          }
          renderItem={({ item: s }) => (
            <View style={styles.staffCard}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarText}>{s.fullName[0]?.toUpperCase() ?? '?'}</Text>
                {/* Live presence: green dot when the staff member is logged in. */}
                {s.shiftOn && <View style={styles.onlineDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{s.fullName}</Text>
                <Text style={styles.staffEmail}>{s.email}</Text>
                <View style={styles.badgeRow}>
                  {s.status === 'pending' ? (
                    <View style={[styles.statusBadge, { backgroundColor: C.warningSoft }]}>
                      <Text style={[styles.statusText, { color: C.warning }]}>Pending</Text>
                    </View>
                  ) : s.status === 'rejected' ? (
                    <View style={[styles.statusBadge, { backgroundColor: C.dangerSoft }]}>
                      <Text style={[styles.statusText, { color: C.danger }]}>Rejected</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: s.isActive ? C.successSoft : C.dangerSoft }]}>
                      <Text style={[styles.statusText, { color: s.isActive ? C.success : C.danger }]}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  )}
                  {s.shiftOn && (
                    <View style={[styles.statusBadge, { backgroundColor: C.successSoft }]}>
                      <Text style={[styles.statusText, { color: C.success }]}>Online</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.actions}>
                {s.status === 'pending' ? (
                  <>
                    <TouchableOpacity onPress={() => handleReject(s)} style={styles.actionBtn}>
                      <Feather name="x" size={16} color={C.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleApprove(s)} style={styles.actionBtn}>
                      <Feather name="check" size={16} color={C.success} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity onPress={() => toggleActive(s)} style={styles.actionBtn}>
                      <Feather name={s.isActive ? 'user-x' : 'user-check'} size={16} color={s.isActive ? C.warning : C.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleArchive(s)} style={styles.actionBtn}>
                      <Feather name="archive" size={16} color={C.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function SummaryItem({ label, value, C }: { label: string; value: number; C: ColorPalette }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: C.textSec, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    summaryCard: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16, marginHorizontal: 20, marginBottom: 16, padding: 16, borderWidth: 1, borderColor: C.border },
    summaryDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    filterRow: { paddingHorizontal: 20, paddingBottom: 16 },
    selectTrigger: { alignSelf: 'flex-start', minWidth: 170 },
    selectValue: { fontSize: 14, fontWeight: '600' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { color: C.textSec, fontSize: 14 },
    staffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 12 },
    avatarSmall: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center' },
    onlineDot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: C.success, borderWidth: 2, borderColor: C.surface },
    avatarText: { color: C.brand, fontSize: 18, fontWeight: '700' },
    staffName: { color: C.text, fontSize: 15, fontWeight: '600' },
    staffEmail: { color: C.textSec, fontSize: 12, marginTop: 2 },
    badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  });
}
