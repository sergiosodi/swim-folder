// Funzione Supabase "polar"
// - collega l'account Polar di un atleta (OAuth2)
// - riceve da Polar la notifica "nuovo allenamento" (webhook)
// - salva zone di frequenza cardiaca e andamento della frequenza cardiaca

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('POLAR_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('POLAR_CLIENT_SECRET') ?? '';
const WEBHOOK_SECRET = Deno.env.get('POLAR_WEBHOOK_SECRET') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/polar`;
const API = 'https://www.polaraccesslink.com/v3';

// Gli allenamenti iniziati prima di questa ora sono "mattina", gli altri "pomeriggio"
const MORNING_BEFORE_HOUR = 13;
// Massimo di punti salvati per il grafico della frequenza cardiaca
const MAX_POINTS = 900;
// Polar elenca solo gli ultimi 30 giorni: la pulizia riguarda solo questa finestra
const WINDOW_DAYS = 29;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// ---------- utilità ----------

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function makeState(userId: string) {
  const payload = b64url(JSON.stringify({ u: userId, e: Date.now() + 15 * 60 * 1000 }));
  return `${payload}.${await hmacHex(CLIENT_SECRET, payload)}`;
}

async function readState(state: string): Promise<string | null> {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmacHex(CLIENT_SECRET, payload))) return null;
  try {
    const { u, e } = JSON.parse(unb64url(payload));
    return Date.now() < e ? (u as string) : null;
  } catch {
    return null;
  }
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "PT1H5M12.5S" -> secondi (accetta anche numeri)
function isoToSeconds(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val > 10000 ? Math.round(val / 1000) : Math.round(val);
  const iso = String(val);
  if (!iso.startsWith('P')) return Number(iso) || 0;
  const m = iso.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return Math.round(
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)
  );
}

// ---------- dati di Polar ----------

type Zone = { index: number; lower: number | null; upper: number | null; seconds: number };
type Series = { rate: number; values: (number | null)[] };

// Legge le zone accettando più varianti dei nomi dei campi
function parseZones(raw: any): Zone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z: any, i: number) => ({
      index: num(z?.index) ?? i + 1,
      lower: num(z?.['lower-limit'] ?? z?.lower_limit ?? z?.lowerLimit ?? z?.lower),
      upper: num(z?.['upper-limit'] ?? z?.upper_limit ?? z?.upperLimit ?? z?.upper),
      seconds: isoToSeconds(z?.['in-zone'] ?? z?.in_zone ?? z?.inZone ?? z?.duration),
    }))
    .sort((a: Zone, b: Zone) => a.index - b.index);
}

// Tra le serie di campioni sceglie quella della frequenza cardiaca
function pickHeartRate(samples: any, avgHr: number | null): Series | null {
  if (!Array.isArray(samples)) return null;

  const candidates = samples
    .map((s: any) => {
      const values: (number | null)[] = String(s?.data ?? '')
        .split(',')
        .map((t) => {
          const x = t.trim();
          if (x === '' || x === 'null') return null;
          const n = Number(x);
          return Number.isFinite(n) ? n : null;
        });
      const nums = values.filter((v): v is number => v !== null);
      const plausible = nums.filter((v) => v >= 30 && v <= 230).length;
      const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      return {
        type: String(s?.['sample-type'] ?? ''),
        rate: Number(s?.['recording-rate']) || 0,
        values,
        mean,
        ok: nums.length > 10 && plausible / nums.length > 0.8 && mean > 45,
      };
    })
    .filter((c) => c.rate > 0 && c.ok);

  if (candidates.length === 0) return null;

  // Il codice "0" dovrebbe essere la frequenza cardiaca; la media vicina a quella dell'allenamento conferma
  const score = (c: { type: string; mean: number }) =>
    (avgHr ? Math.abs(c.mean - avgHr) : 0) + (c.type === '0' ? 0 : 5);
  candidates.sort((a, b) => score(a) - score(b));
  return { rate: candidates[0].rate, values: candidates[0].values };
}

// Se Polar manda le zone a zero, il tempo in ogni zona si calcola dai campioni
function secondsFromSamples(zones: Zone[], series: Series): number[] {
  const out = zones.map(() => 0);
  const top = zones.length - 1;
  for (const v of series.values) {
    if (v === null) continue;
    for (let i = 0; i < zones.length; i++) {
      const lo = zones[i].lower as number;
      const hi = zones[i].upper as number;
      if (v >= lo && (v < hi || (i === top && v <= hi))) {
        out[i] += series.rate;
        break;
      }
    }
  }
  return out;
}

// Riduce i punti a una quantità gestibile facendo la media
function downsample(series: Series): Series {
  if (series.values.length <= MAX_POINTS) return series;
  const step = Math.ceil(series.values.length / MAX_POINTS);
  const values: (number | null)[] = [];
  for (let i = 0; i < series.values.length; i += step) {
    const chunk = series.values.slice(i, i + step).filter((v): v is number => v !== null);
    values.push(chunk.length ? Math.round(chunk.reduce((a, b) => a + b, 0) / chunk.length) : null);
  }
  return { rate: series.rate * step, values };
}

// detailed = true se l'esercizio è stato scaricato con i campioni
function toRow(userId: string, ex: any, detailed: boolean) {
  if (!ex?.id || !ex?.start_time) return null;
  const start = String(ex.start_time); // ora locale, es. 2026-10-05T17:30:00
  const hour = Number(start.slice(11, 13));
  const avgHr = num(ex.heart_rate?.average);

  const zones = parseZones(ex.heart_rate_zones);
  const series = detailed ? pickHeartRate(ex.samples, avgHr) : null;

  const polarTotal = zones.reduce((a, z) => a + z.seconds, 0);
  const hasLimits = zones.length > 0 && zones.every((z) => z.lower !== null && z.upper !== null);
  if (polarTotal === 0 && series && hasLimits) {
    const calc = secondsFromSamples(zones, series);
    zones.forEach((z, i) => (z.seconds = calc[i]));
  }

  const stored = series ? downsample(series) : null;

  console.log(
    'Polar esercizio', ex.id,
    '| zone:', zones.length,
    '| secondi da Polar:', polarTotal,
    '| limiti:', hasLimits,
    '| tipi campioni:', Array.isArray(ex.samples) ? ex.samples.map((s: any) => s?.['sample-type']).join(',') : 'nessuno',
    '| frequenza cardiaca trovata:', !!series
  );

  return {
    user_id: userId,
    polar_exercise_id: String(ex.id),
    date: start.slice(0, 10),
    slot: hour < MORNING_BEFORE_HOUR ? 'morning' : 'afternoon',
    start_time: start,
    duration_seconds: isoToSeconds(ex.duration),
    avg_hr: avgHr,
    max_hr: num(ex.heart_rate?.maximum),
    zones,
    raw_zones: ex.heart_rate_zones ?? null,
    hr_samples: stored ? stored.values : [],
    // null = campioni da scaricare ancora, 0 = scaricati ma senza frequenza cardiaca
    hr_rate: detailed ? (stored ? stored.rate : 0) : null,
  };
}

async function disconnectLocal(userId: string, deleteData: boolean) {
  if (deleteData) await admin.from('polar_exercises').delete().eq('user_id', userId);
  await admin.from('polar_tokens').delete().eq('user_id', userId);
  await admin.from('polar_connections').delete().eq('user_id', userId);
}

function polarGet(path: string, token: string) {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'SwimApp/1.0',
    },
  });
}

// Scarica gli allenamenti degli ultimi 30 giorni e salva quelli nuovi con zone e campioni
async function syncUser(userId: string, token: string) {
  const res = await polarGet('/exercises?zones=true', token);

  if (res.status === 401) {
    // l'atleta ha revocato l'accesso dal suo account Polar
    await disconnectLocal(userId, false);
    return { ok: false, status: 401, error: 'Accesso Polar revocato' };
  }
  if (!res.ok && res.status !== 204) {
    return { ok: false, status: res.status, error: 'Polar ha risposto con un errore' };
  }

  const list = res.status === 204 ? [] : await res.json();
  const exercises: any[] = Array.isArray(list) ? list : [];
  const activeIds = new Set(exercises.filter((e) => e?.id).map((e) => String(e.id)));

  // Cosa abbiamo già salvato
  const { data: stored } = await admin
    .from('polar_exercises')
    .select('polar_exercise_id, hr_rate, start_time')
    .eq('user_id', userId);
  const storedRows = (stored ?? []) as {
    polar_exercise_id: string;
    hr_rate: number | null;
    start_time: string;
  }[];
  const done = new Set(storedRows.filter((r) => r.hr_rate !== null).map((r) => r.polar_exercise_id));

  // Solo gli allenamenti senza campioni vengono scaricati (e salvati) di nuovo
  const rows = [];
  for (const ex of exercises) {
    if (!ex?.id || done.has(String(ex.id))) continue;

    let full = ex;
    let detailed = false;
    try {
      const r = await polarGet(
        `/exercises/${encodeURIComponent(String(ex.id))}?zones=true&samples=true`,
        token
      );
      if (r.ok) {
        full = await r.json();
        detailed = true;
      } else {
        console.error('Dettaglio esercizio non disponibile', ex.id, r.status);
      }
    } catch (e) {
      console.error('Errore nel dettaglio esercizio', ex.id, e);
    }

    const row = toRow(userId, full, detailed);
    if (row) rows.push(row);
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from('polar_exercises')
      .upsert(rows as Record<string, unknown>[], { onConflict: 'user_id,polar_exercise_id' });
    if (error) return { ok: false, status: 500, error: error.message };
  }

  // Toglie solo gli allenamenti recenti che non ci sono più su Polar (mai lo storico più vecchio)
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 19);
  const toDelete = storedRows
    .filter((r) => r.start_time >= windowStart && !activeIds.has(r.polar_exercise_id))
    .map((r) => r.polar_exercise_id);
  if (toDelete.length > 0) {
    await admin
      .from('polar_exercises')
      .delete()
      .eq('user_id', userId)
      .in('polar_exercise_id', toDelete);
  }

  return { ok: true, count: rows.length };
}

// ---------- 1) ritorno da Polar dopo l'autorizzazione ----------

async function handleCallback(url: URL) {
  const back = (q: string) => Response.redirect(`${APP_URL}/profile?polar=${q}`, 302);
  if (url.searchParams.get('error')) return back('annullato');

  const userId = await readState(url.searchParams.get('state') ?? '');
  const code = url.searchParams.get('code');
  if (!userId || !code) return back('errore');

  try {
    const tokenRes = await fetch('https://polarremote.com/v2/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json;charset=UTF-8',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) return back('errore');
    const tok = await tokenRes.json();
    const accessToken = String(tok.access_token);
    const polarUserId = String(tok.x_user_id);

    // Registra l'utente (se è già registrato Polar risponde 409: va bene)
    await fetch(`${API}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ 'member-id': userId }),
    }).catch(() => {});

    await admin
      .from('polar_tokens')
      .upsert(
        { user_id: userId, polar_user_id: polarUserId, access_token: accessToken },
        { onConflict: 'user_id' }
      );
    await admin
      .from('polar_connections')
      .upsert({ user_id: userId, connected_at: new Date().toISOString() }, { onConflict: 'user_id' });

    return back('ok');
  } catch {
    return back('errore');
  }
}

// ---------- 2) notifica di Polar: nuovo allenamento ----------

async function handleWebhook(req: Request) {
  const event = req.headers.get('polar-webhook-event');
  const raw = await req.text();

  if (event === 'PING') return new Response('ok', { status: 200 });
  if (!WEBHOOK_SECRET) return new Response('webhook non configurato', { status: 500 });

  const sig = req.headers.get('polar-webhook-signature') ?? '';
  if (!safeEqual(sig, await hmacHex(WEBHOOK_SECRET, raw))) {
    return new Response('firma non valida', { status: 401 });
  }

  const payload = JSON.parse(raw);

  if (event === 'EXERCISE_DELETED' || event === 'DELETED') {
    const exerciseId = String(payload.entity_id || payload.exercise_id);
    if (exerciseId) {
      await admin.from('polar_exercises').delete().eq('polar_exercise_id', exerciseId);
    }
    return new Response('ok', { status: 200 });
  }

  if (event !== 'EXERCISE') return new Response('ok', { status: 200 });

  const { data: t } = await admin
    .from('polar_tokens')
    .select('user_id, access_token')
    .eq('polar_user_id', String(payload.user_id))
    .maybeSingle();

  if (t) await syncUser(t.user_id as string, t.access_token as string);
  return new Response('ok', { status: 200 });
}

// ---------- 3) richieste dall'app ----------

async function handleApp(req: Request) {
  if (req.method !== 'POST') return json({ error: 'Metodo non valido' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'Non autenticato' }, 401);
  const userId = data.user.id;

  const body = await req.json().catch(() => ({}));

  if (body.action === 'connect') {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Polar non configurato' }, 500);
    const state = await makeState(userId);
    const url =
      'https://flow.polar.com/oauth2/authorization' +
      `?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=accesslink.read_all`;
    return json({ url });
  }

  const { data: t } = await admin
    .from('polar_tokens')
    .select('polar_user_id, access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (body.action === 'sync') {
    if (!t) return json({ error: 'Polar non collegato' }, 400);
    const r = await syncUser(userId, t.access_token as string);
    return json(r, r.ok ? 200 : 502);
  }

  if (body.action === 'disconnect') {
    if (t) {
      await fetch(`${API}/users/${t.polar_user_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t.access_token}` },
      }).catch(() => {});
    }
    await disconnectLocal(userId, true);
    return json({ ok: true });
  }

  return json({ error: 'Azione non valida' }, 400);
}

// ---------- ingresso ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  try {
    if (req.headers.has('polar-webhook-event') || req.headers.has('polar-webhook-signature')) {
      return await handleWebhook(req);
    }
    if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
      return await handleCallback(url);
    }
    return await handleApp(req);
  } catch (e) {
    console.error(e);
    return json({ error: 'Errore interno' }, 500);
  }
});