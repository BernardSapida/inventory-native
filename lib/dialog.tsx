import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from 'heroui-native';
import { useColors, type ColorPalette } from '@/lib/constants';

type DialogBtn = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type DialogState = {
  isOpen: boolean;
  title: string;
  message?: string;
  buttons: DialogBtn[];
};

type DialogCtx = {
  showAlert: (title: string, message?: string, buttons?: DialogBtn[]) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, confirmText?: string) => void;
};

const Ctx = createContext<DialogCtx | null>(null);

const CLOSED: DialogState = { isOpen: false, title: '', message: undefined, buttons: [] };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(CLOSED);
  const palette = useColors();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const showAlert = useCallback((title: string, message?: string, buttons?: DialogBtn[]) => {
    setState({ isOpen: true, title, message, buttons: buttons ?? [{ text: 'OK' }] });
  }, []);

  const showConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void, confirmText = 'Confirm') => {
      setState({
        isOpen: true,
        title,
        message,
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: confirmText, style: 'destructive', onPress: onConfirm },
        ],
      });
    },
    [],
  );

  const dismiss = useCallback(() => setState(CLOSED), []);

  const variantFor = (style?: string) => {
    if (style === 'destructive') return 'danger' as const;
    if (style === 'cancel') return 'ghost' as const;
    return 'primary' as const;
  };

  return (
    <Ctx.Provider value={{ showAlert, showConfirm }}>
      {children}
      {/* Rendered inside a native <Modal> rather than a portal: a portal mounts
          into the root React tree, which sits BENEATH any open React Native
          <Modal> (its own native window). By being a Modal itself, this dialog is
          presented last and therefore always stacks on top -- so alerts fired from
          inside a form sheet no longer disappear behind it. */}
      <Modal
        visible={state.isOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        {/* Solid dark scrim. Not pressable-to-close, matching the old behavior --
            an alert is dismissed by choosing a button. */}
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.textBlock}>
              <Text style={styles.title}>{state.title}</Text>
              {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
            </View>
            <View style={styles.actions}>
              {state.buttons.map((btn, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={variantFor(btn.style)}
                  onPress={() => {
                    dismiss();
                    btn.onPress?.();
                  }}
                >
                  {btn.text}
                </Button>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

export function useAppDialog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppDialog must be used within DialogProvider');
  return ctx;
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    textBlock: { marginBottom: 18, gap: 6 },
    title: { color: C.text, fontSize: 17, fontWeight: '700' },
    message: { color: C.textSec, fontSize: 14, lineHeight: 20 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  });
}
