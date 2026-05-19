import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/lib/constants';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

const ICON: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'alert-triangle',
  info: 'info',
};

export function Toast({ message, type = 'success', visible, onHide, duration = 2500 }: ToastProps) {
  const palette = useColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]),
        Animated.delay(duration),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -12, duration: 180, useNativeDriver: true }),
        ]),
      ]).start(() => onHide());
    }
  }, [visible]);

  if (!visible) return null;

  const accentColor = {
    success: palette.success,
    error: palette.danger,
    warning: palette.warning,
    info: palette.info,
  }[type];

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderLeftColor: accentColor,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Feather name={ICON[type]} size={16} color={accentColor} />
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
    </Animated.View>
  );
}

export function useToast() {
  const show = useRef<((msg: string, type?: ToastType) => void) | null>(null);
  return show;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  text: { fontSize: 14, fontWeight: '600', flex: 1 },
});
