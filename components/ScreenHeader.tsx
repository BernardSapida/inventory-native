import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/lib/constants';
import { useSidebar } from '@/lib/sidebar';

interface Props {
  title: string;
  right?: ReactNode;
}

export default function ScreenHeader({ title, right }: Props) {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const { open } = useSidebar();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity onPress={open} style={styles.menuBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="menu" size={22} color={C.text} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>{title}</Text>
      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  menuBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '700' },
  spacer: { width: 36 },
});
