import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

const OPTION_H = 52;

const OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Non inserita', value: null },
  ...Array.from({ length: 11 }, (_, i) => ({ label: String(i), value: i })),
];

type Props = {
  value: number | null;
  onChange: (v: number | null) => void;
};

export default function FatiguePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<ScrollView>(null);

  const selectedIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === value)
  );
  const current = OPTIONS[selectedIndex];

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, value === null && styles.placeholder]}>
          {current.label}
        </Text>
        <Text style={styles.arrow}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>FATICA GENERALE</Text>
            <ScrollView
              ref={ref}
              style={styles.list}
              onLayout={() =>
                ref.current?.scrollTo({
                  y: Math.max(0, selectedIndex - 2) * OPTION_H,
                  animated: false,
                })
              }
            >
              {OPTIONS.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.label}
                    style={[styles.option, on && styles.optionOn]}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
                    {on && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldText: { fontSize: 17, color: colors.text, fontWeight: '600' },
  placeholder: { color: colors.muted, fontWeight: '400' },
  arrow: { fontSize: 18, color: colors.primary },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  list: { maxHeight: OPTION_H * 6 },
  option: {
    height: OPTION_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  optionOn: { backgroundColor: '#E8F1FC' },
  optionText: { fontSize: 20, color: colors.text },
  optionTextOn: { color: colors.primary, fontWeight: '700' },
  check: { fontSize: 20, color: colors.primary },
});