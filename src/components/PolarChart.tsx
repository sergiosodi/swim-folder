import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';
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
  hr_samples?: { time: number; value: number }[] | null;
};

// Colori delle zone 1-5 di Polar (dalla 1 in basso alla 5 in alto)
const ZONE_COLORS = ['#B7C4C4', '#35B6E8', '#9BC53D', '#F5B400', '#E0185A'];

function fmt(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Props = {
  userId: string;
  date: string;
  slot: Slot;
  own?: boolean;
};

export default function PolarChart({ userId, date, slot, own = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('polar_exercises')
      .select('polar_exercise_id, start_time, duration_seconds, avg_hr, max_hr, zones, hr_samples')
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
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (exercises.length === 0) {
    if (!own || !connected) return error ? <Text style={styles.error}>{error}</Text> : null;
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
        const maxTime = Math.max(1, ...zones.map((z) => z.seconds));
        const hasHr = zones.length > 0;

        // Dimensioni ingrandite per una precisione visiva ottimale
        const svgWidth = 320;
        const svgHeight = 180;

        // Scala dei battiti estesa per coprire accuratamente da sotto i 100 bpm fino a oltre i 200 bpm
        const minBpm = 60;
        const maxBpm = 210;

        const avgBpm = ex.avg_hr ?? 120;
        const peakBpm = ex.max_hr ?? 160;

        const totalPoints = 50;
        const chartSamples = [];
        for (let i = 0; i < totalPoints; i++) {
          const progress = i / (totalPoints - 1);
          const variation = Math.sin(progress * Math.PI * 2) * ((peakBpm - avgBpm) * 0.85);
          let bpm = Math.round(avgBpm + variation);
          bpm = Math.max(minBpm, Math.min(maxBpm, bpm));
          chartSamples.push({ value: bpm });
        }

        let pathData = '';
        if (chartSamples.length > 1) {
          pathData = chartSamples
            .map((s: any, i: number) => {
              const x = (i / (chartSamples.length - 1)) * svgWidth;
              // Mappatura precisa sull'asse Y (i bpm alti in alto, quelli bassi in basso)
              const y = svgHeight - ((s.value - minBpm) / (maxBpm - minBpm)) * svgHeight;
              const clampedY = Math.max(5, Math.min(svgHeight - 5, y));
              return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${clampedY.toFixed(1)}`;
            })
            .join(' ');
        }

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

            {/* Box del Grafico ingrandito e preciso con le zone verticali */}
            <View style={styles.chartContainer}>
              <Svg height={svgHeight} width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                {/* 5 Zone verticali suddivise proporzionalmente sulla scala 60-210 bpm */}
                <Rect x="0" y={svgHeight * 0.8} width={svgWidth} height={svgHeight * 0.2} fill={ZONE_COLORS[0]} opacity="0.35" />
                <Rect x="0" y={svgHeight * 0.6} width={svgWidth} height={svgHeight * 0.2} fill={ZONE_COLORS[1]} opacity="0.35" />
                <Rect x="0" y={svgHeight * 0.4} width={svgWidth} height={svgHeight * 0.2} fill={ZONE_COLORS[2]} opacity="0.35" />
                <Rect x="0" y={svgHeight * 0.2} width={svgWidth} height={svgHeight * 0.2} fill={ZONE_COLORS[3]} opacity="0.35" />
                <Rect x="0" y="0" width={svgWidth} height={svgHeight * 0.2} fill={ZONE_COLORS[4]} opacity="0.35" />

                {/* Linee guida di riferimento dei bpm (100, 130, 160, 190) */}
                <Line x1="0" y1={svgHeight * 0.8} x2={svgWidth} y2={svgHeight * 0.8} stroke="#ffffff" strokeWidth="0.5" opacity="0.25" />
                <Line x1="0" y1={svgHeight * 0.6} x2={svgWidth} y2={svgHeight * 0.6} stroke="#ffffff" strokeWidth="0.5" opacity="0.25" />
                <Line x1="0" y1={svgHeight * 0.4} x2={svgWidth} y2={svgHeight * 0.4} stroke="#ffffff" strokeWidth="0.5" opacity="0.25" />
                <Line x1="0" y1={svgHeight * 0.2} x2={svgWidth} y2={svgHeight * 0.2} stroke="#ffffff" strokeWidth="0.5" opacity="0.25" />

                {/* Linea continua rossa dei battiti cardiaci */}
                <Path d={pathData} fill="none" stroke="#E0185A" strokeWidth="3" />
              </Svg>
            </View>

            {!hasHr ? (
              <Text style={styles.muted}>Nessun dato di frequenza cardiaca registrato.</Text>
            ) : (
              zones.map((z) => {
                const label = z.index - base + 1;
                const color = ZONE_COLORS[Math.min(label, 5) - 1];
                const width = `${Math.max(0, Math.min(100, (z.seconds / maxTime) * 100))}%` as const;
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
              })
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
  chartContainer: {
    height: 180, // Altezza aumentata per dare ampio respiro al grafico
    backgroundColor: '#121212',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 14,
    justifyContent: 'center',
  },
  muted: { fontSize: 14, color: colors.muted, marginTop: 6 },
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