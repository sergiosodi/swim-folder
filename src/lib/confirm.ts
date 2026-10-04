import { Alert, Platform } from 'react-native';

type Options = {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
};

// Su telefono usa la finestra nativa; sul web Alert.alert non funziona, quindi usa window.confirm.
export function confirmAction({ title, message, confirmText, destructive, onConfirm }: Options) {
  if (Platform.OS === 'web') {
    const w: any = globalThis;
    if (typeof w.confirm === 'function' && w.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Annulla', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}