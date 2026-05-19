import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAppDialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors, ColorPalette } from '@/lib/constants';

export default function BackupSync() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showAlert } = useAppDialog();

  function comingSoon() {
    showAlert('Coming Soon', 'This feature will be available in a future update.');
  }

  const options = [
    { icon: 'upload-cloud' as const, label: 'Export Inventory to CSV', desc: 'Download all inventory data as a CSV file', action: comingSoon },
    { icon: 'download-cloud' as const, label: 'Import from CSV', desc: 'Upload a CSV file to bulk-import items', action: comingSoon },
    { icon: 'refresh-cw' as const, label: 'Sync Now', desc: 'Force a sync with the cloud database', action: comingSoon },
    { icon: 'clock' as const, label: 'Last Synced', desc: 'Firebase syncs in real-time automatically', action: undefined },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/profile')} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Backup & Sync</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBanner}>
          <Feather name="info" size={16} color={C.info} />
          <Text style={styles.infoText}>
            SmartStock uses Firebase Firestore which syncs data in real-time across all devices automatically.
          </Text>
        </View>

        {options.map((opt) => (
          <TouchableOpacity
            key={opt.label}
            style={[styles.optionCard, !opt.action && { opacity: 0.6 }]}
            onPress={opt.action}
            disabled={!opt.action}
            activeOpacity={0.8}
          >
            <View style={styles.iconWrap}>
              <Feather name={opt.icon} size={20} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optLabel}>{opt.label}</Text>
              <Text style={styles.optDesc}>{opt.desc}</Text>
            </View>
            {opt.action && <Feather name="chevron-right" size={16} color={C.textSec} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
    headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    content: { padding: 20, paddingBottom: 40 },
    infoBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.infoSoft, borderRadius: 12, padding: 14, gap: 10, marginBottom: 20, borderWidth: 1, borderColor: C.info + '40' },
    infoText: { color: C.text, fontSize: 13, lineHeight: 20, flex: 1 },
    optionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 14 },
    iconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.brandSoft, justifyContent: 'center', alignItems: 'center' },
    optLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
    optDesc: { color: C.textSec, fontSize: 12, marginTop: 2 },
  });
}
