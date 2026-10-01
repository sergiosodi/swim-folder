import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

// Non serve più, ma resta esportato perché altri file lo importano.
export const KEYBOARD_BAR_ID = 'swim-keyboard-bar';

export default function KeyboardDone() {
  const [visible, setVisible] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      // Su iOS la schermata non si ridimensiona: sollevo il pulsante dell'altezza della tastiera.
      // Su Android la finestra si ridimensiona da sola.
      setOffset(ios ? e.endCoordinates.height : 0);
      setVisible(true);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setVisible(false);
      setOffset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={[styles.floating, { bottom: offset + 8 }]} pointerEvents="box-none">
      <Pressable style={styles.button} onPress={Keyboard.dismiss}>
        <Text style={styles.text}>Chiudi tastiera</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', right: 12, zIndex: 100, elevation: 10 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '600' },
});