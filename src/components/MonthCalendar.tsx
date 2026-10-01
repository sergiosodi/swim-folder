import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { DAY_SHORT, MONTH_LONG, fromISO, toISO, todayISO } from '@/lib/dates';

type Props = {
  visible: boolean;
  selected: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

export default function MonthCalendar({ visible, selected, onSelect, onClose }: Props) {
  const start = fromISO(selected);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());

  // Ogni volta che si apre, parte dal mese del giorno selezionato
  useEffect(() => {
    if (visible) {
      const d = fromISO(selected);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  }, [visible, selected]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lunedì = 0
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, i) => toISO(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const today = todayISO();
  const monthName = MONTH_LONG[month].charAt(0).toUpperCase() + MONTH_LONG[month].slice(1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.navRow}>
            <Pressable onPress={() => setYear(year - 1)} hitSlop={10} style={styles.navBtn}>
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{year}</Text>
            <Pressable onPress={() => setYear(year + 1)} hitSlop={10} style={styles.navBtn}>
              <Text style={styles.navText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.navRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navBtn}>
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{monthName}</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navBtn}>
              <Text style={styles.navText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {DAY_SHORT.map((d) => (
              <Text key={d} style={styles.weekLabel}>
                {d}
              </Text>
            ))}
          </View>

          {rows.map((row, r) => (
            <View key={r} style={styles.weekRow}>
              {row.map((iso, c) => {
                if (!iso) return <View key={c} style={styles.cell} />;
                const isSel = iso === selected;
                const isToday = iso === today;
                return (
                  <Pressable
                    key={c}
                    style={styles.cell}
                    onPress={() => {
                      onSelect(iso);
                      onClose();
                    }}
                  >
                    <View
                      style={[
                        styles.dayCircle,
                        isToday && styles.dayToday,
                        isSel && styles.daySelected,
                      ]}
                    >
                      <Text style={[styles.dayText, isSel && styles.dayTextSel]}>
                        {Number(iso.slice(8))}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                onSelect(today);
                onClose();
              }}
              hitSlop={8}
            >
              <Text style={styles.footerLink}>Oggi</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.footerLink}>Chiudi</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  navBtn: { paddingHorizontal: 16 },
  navText: { fontSize: 30, color: colors.primary, lineHeight: 32 },
  navLabel: { fontSize: 18, fontWeight: '700', color: colors.text },
  weekRow: { flexDirection: 'row', marginTop: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 8 },
  cell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 16, color: colors.text },
  dayTextSel: { color: '#fff', fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 6 },
  footerLink: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});