import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Slot } from '@/lib/sessions';

type Zone = { index: number; lower: number | null; upper: number | null; seconds: number };
type Exercise = {
  polar_exercise_id: string;
  start_time: string;
  duration_seconds: number;
  avg_hr: number | null;
  max_hr: number | null;
  zones: Zone[];
  hr_samples: (number | null)[] | null;
  hr_rate: number | null;
};

// Fasce chiare dietro la linea (zone 1-5) e colori pieni delle barre, come nell'app Polar
const BAND_COLORS = ['#E3E6E8', '#BDE5F5', '#D4E8BC', '#FBE4A6', '#F8B8CC'];
const BAR_COLORS = ['#B7C4C4', '#35B6E8', '#9BC53D', '#F5B400', '#E0185A', '#7B1FA2'];
const LINE_COLOR = '#E4002B';

function fmt(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ----- grafico della frequenza cardiaca nel tempo -----

function HrChart({
  samples,
  rate,
  zones,
}: {
  samples: (number | null)[];
  rate: number;
  zones: Zone[];
}) {
  const [width, setWidth] = useState(0);

  const nums = samples.filter((v): v is number => v !== null);
  if (nums.length < 2 || rate <= 0) return null;

  const sorted = [...zones].sort((a, b) => a.index - b.index);
  const hasBands = sorted.length > 0 && sorted.every((z) => z.lower !== null && z.upper !== null);

  // Come in Polar: l'asse va dal limite basso della zona 1 al limite alto della zona 5
  const yMin = hasBands
    ? (sorted[0].lower as number)
    : Math.floor(Math.min(...nums) / 10) * 10 - 10;
  const yMax = hasBands
    ? (sorted[sorted.length - 1].upper as number)
    : Math.ceil(Math.max(...nums) / 10) * 10 + 10;

  const H = 230;
  const L = 38;
  const R = hasBands ? 38 : 10;
  const T = 10;
  const B = 28;
  const plotW = Math.max(0, width - L - R);
  const plotH = H - T - B;

  const y = (v: number) => {
    const c = Math.min(yMax, Math.max(yMin, v));
    return T + (1 - (c - yMin) / (yMax - yMin)) * plotH;
  };
  const n = samples.length;
  const x = (i: number) => L + (n > 1 ? i / (n - 1) : 0) * plotW;
  const totalSeconds = (n - 1) * rate;

  // Linea continua; i valori mancanti (sensore scollegato) interrompono il tracciato
  let d = '';
  let pen = false;
  samples.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });

  // Valori sull'asse: i limiti delle zone, oppure 5 valori equidistanti
  const ticks: number[] = hasBands
    ? [...sorted.map((z) => z.lower as number), sorted[sorted.length - 1].upper as number]
    : Array.from({ length: 5 }, (_, i) => Math.round(yMin + ((yMax - yMin) * i) / 4));

  const timeTicks = [0.25, 0.5, 0.75, 1];

  return (
    <View style={styles.chartWrap} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={H}>
          {hasBands ? (
            sorted.map((z, i) => (
              <Rect
                key={z.index}
                x={L}
                y={y(z.upper as number)}
                width={plotW}
                height={Math.max(0, y(z.lower as number) - y(z.upper as number))}
                fill={BAND_COLORS[Math.min(i, 4)]}
              />
            ))
          ) : (
            <Rect x={L} y={T} width={plotW} height={plotH} fill="#EEF1F5" />
          )}

          {ticks.map((v) => (
            <Line
              key={`g${v}`}
              x1={L}
              x2={L + plotW}
              y1={y(v)}
              y2={y(v)}
              stroke="#BFC6CB"
              strokeWidth={0.6}
            />
          ))}

          {ticks.map((v) => (
            <SvgText
              key={`l${v}`}
              x={L - 5}
              y={y(v) + 3.5}
              fontSize={10}
              fill="#555"
              textAnchor="end"
            >
              {Math.round(v)}
            </SvgText>
          ))}

          {hasBands &&
            ticks.map((v) => (
              <SvgText
                key={`p${v}`}
                x={L + plotW + 5}
                y={y(v) + 3.5}
                fontSize={10}
                fill="#555"
                textAnchor="start"
              >
                {Math.round((v / yMax) * 100)}
              </SvgText>
            ))}

          <Path d={d} stroke={LINE_COLOR} strokeWidth={1.4} fill="none" strokeLinejoin="round" />

          {timeTicks.map((f) => (
            <SvgText
              key={`t${f}`}
              x={Math.min(L + plotW - 2, L + f * plotW)}
              y={H - 8}
              fontSize={10}
              fill="#555"
              textAnchor="end"
            >
              {clock(f * totalSeconds)}
            </SvgText>
          ))}

          <SvgText x={4} y={8} fontSize={9} fill="#777" textAnchor="start">
            bpm
          </SvgText>
          {hasBands && (
            <SvgText x={width - 4} y={8} fontSize={9} fill="#777" textAnchor="end">
              %
            </SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}

// ----- scheda completa -----

type Props = {
  userId: string;
  date: string;
  slot: Slot;
  // true = lo guarda la persona stessa (può aggiornare i dati)
  own?: boolean;
  // true = se non ci sono dati non mostra niente (neanche il promemoria)
  hideIfEmpty?: boolean;
};

export default function PolarChart({ userId, date, slot, own = false, hideIfEmpty = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('polar_exercises')
      .select(
        'polar_exercise_id, start_time, duration_seconds, avg_hr, max_hr, zones, hr_samples, hr_rate'
      )
      .eq('user_id', userId)
      .eq('date', date)
      .eq('slot', slot)
      .order('start_time', { ascending: true });

    if (err) setError('Non riesco a caricare i dati Polar: ' + err.message);
    else setExercises((data ?? []) as Exercise[]);

    if (own) {
      const { data: c } = await supabase
        .from('polar_connections')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      setConnected(!!c);
    }
    setLoading(false);
  }, [userId, date, slot, own]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
  }, [load]);

  async function refresh() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    const { error: err } = await supabase.functions.invoke('polar', { body: { action: 'sync' } });
    if (err) setError('Non sono riuscito ad aggiornare i dati da Polar.');
    await load();
    setSyncing(false);
  }

  if (loading) {
    if (hideIfEmpty) return null;
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Niente sensore: l'allenatore non vede nulla, l'atleta collegato vede un promemoria
  if (exercises.length === 0) {
    if (hideIfEmpty || !own || !connected) {
      return error ? <Text style={styles.error}>{error}</Text> : null;
    }
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Sensore Polar</Text>
        <Text style={styles.muted}>Nessun dato Polar per questo allenamento.</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={refresh} disabled={syncing} hitSlop={8}>
          <Text style={styles.link}>{syncing ? 'Aggiorno...' : 'Aggiorna dati Polar'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {exercises.map((ex) => {
        const zones = [...(ex.zones ?? [])].sort((a, b) => b.index - a.index);
        const base = zones.length ? Math.min(...zones.map((z) => z.index)) : 0;
        const max = Math.max(1, ...zones.map((z) => z.seconds));
        const totalZones = zones.reduce((a, z) => a + z.seconds, 0);
        const samples = ex.hr_samples ?? [];
        const hasLine = samples.length > 1 && (ex.hr_rate ?? 0) > 0;

        return (
          <View key={ex.polar_exercise_id} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Sensore Polar</Text>
              <Text style={styles.start}>ore {ex.start_time.slice(11, 16)}</Text>
            </View>

            <Text style={styles.summary}>
              Durata {fmt(ex.duration_seconds)}
              {ex.avg_hr != null ? `  ·  FC media ${ex.avg_hr}` : ''}
              {ex.max_hr != null ? `  ·  FC max ${ex.max_hr}` : ''}
            </Text>

            {hasLine ? (
              <HrChart samples={samples} rate={ex.hr_rate as number} zones={[...(ex.zones ?? [])]} />
            ) : (
              <Text style={styles.muted}>
                L'andamento della frequenza cardiaca non è disponibile per questo allenamento.
              </Text>
            )}

            {zones.length === 0 ? (
              <Text style={styles.muted}>Polar non ha fornito le zone di frequenza cardiaca.</Text>
            ) : (
              <View style={{ marginTop: 14 }}>
                {zones.map((z) => {
                  const label = z.index - base + 1;
                  const color = BAR_COLORS[Math.min(label, 6) - 1];
                  const width = `${Math.max(0, Math.min(100, (z.seconds / max) * 100))}%` as const;
                  return (
                    <View key={z.index} style={styles.row}>
                      <View style={[styles.badge, { backgroundColor: color }]}>
                        <Text style={styles.badgeText}>{label}</Text>
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width, backgroundColor: color }]} />
                        {z.lower != null && z.upper != null && (
                          <Text style={styles.range}>
                            {z.lower}–{z.upper} bpm
                          </Text>
                        )}
                      </View>
                      <Text style={styles.time}>{fmt(z.seconds)}</Text>
                    </View>
                  );
                })}
                {totalZones === 0 && (
                  <Text style={styles.muted}>Polar non ha indicato il tempo trascorso nelle zone.</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {own && (
        <Pressable onPress={refresh} disabled={syncing} hitSlop={8} style={{ marginTop: 4 }}>
          <Text style={styles.link}>{syncing ? 'Aggiorno...' : 'Aggiorna dati Polar'}</Text>
        </Pressable>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 16, alignItems: 'center' },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  start: { fontSize: 13, color: colors.muted },
  summary: { fontSize: 13, color: colors.muted, marginTop: 6, marginBottom: 12 },
  muted: { fontSize: 14, color: colors.muted, marginTop: 6 },
  chartWrap: { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  badge: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  track: {
    flex: 1,
    height: 30,
    backgroundColor: '#EEF1F5',
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.85 },
  range: { fontSize: 12, color: colors.text, paddingHorizontal: 8 },
  time: { width: 64, textAlign: 'right', fontSize: 14, color: colors.text },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600', marginTop: 10 },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 },
});