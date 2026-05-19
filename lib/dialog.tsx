import React, { createContext, useCallback, useContext, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog } from 'heroui-native';

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
      <Dialog isOpen={state.isOpen} onOpenChange={(v) => !v && dismiss()}>
        <Dialog.Portal>
          <Dialog.Overlay isCloseOnPress={false} />
          <Dialog.Content isSwipeable={false}>
            <View className="mb-4 gap-1.5">
              <Dialog.Title>{state.title}</Dialog.Title>
              {state.message ? <Dialog.Description>{state.message}</Dialog.Description> : null}
            </View>
            <View className="flex-row justify-end gap-3">
              {state.buttons.map((btn, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={variantFor(btn.style)}
                  onPress={() => { dismiss(); btn.onPress?.(); }}
                >
                  {btn.text}
                </Button>
              ))}
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useAppDialog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppDialog must be used within DialogProvider');
  return ctx;
}
