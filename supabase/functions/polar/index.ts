// Funzione Supabase "polar"
// - collega l'account Polar di un atleta (OAuth2)
// - riceve da Polar la notifica "nuovo allenamento" (webhook)
// - salva il tempo passato in ogni zona di frequenza cardiaca

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

// "state": dice a quale utente appartiene il collegamento, firmato e valido 15 minuti
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

// "PT1H5M12S" -> secondi
function isoToSeconds(iso?: string): number {
  if (!iso) return 0;
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

function toRow(userId: string, ex: any) {
  if (!ex?.id || !ex?.start_time) return null;
  const start = String(ex.start_time); // ora locale, es. 2026-10-05T17:30:00
  const hour = Number(start.slice(11, 13));

  const zones = Array.isArray(ex.heart_rate_zones)
    ? ex.heart_rate_zones
        .map((z: any) => ({
          index: Number(z.index),
          lower: z['lower-limit'] ?? null,
          upper: z['upper-limit'] ?? null,
          seconds: isoToSeconds(z['in-zone']),
        }))
        .sort((a: any, b: any) => a.index - b.index)
    : [];

  return {
    user_id: userId,
    polar_exercise_id: String(ex.id),
    date: start.slice(0, 10),
    slot: hour < MORNING_BEFORE_HOUR ? 'morning' : 'afternoon',
    start_time: start,
    duration_seconds: isoToSeconds(ex.duration),
    avg_hr: ex.heart_rate?.average ?? null,
    max_hr: ex.heart_rate?.maximum ?? null,
    zones,
  };
}

async function disconnectLocal(userId: string, deleteData: boolean) {
  if (deleteData) await admin.from('polar_exercises').delete().eq('user_id', userId);
  await admin.from('polar_tokens').delete().eq('user_id', userId);
  await admin.from('polar_connections').delete().eq('user_id', userId);
}

// Scarica gli allenamenti degli ultimi 30 giorni (con le zone) e li salva
async function syncUser(userId: string, token: string) {
  const res = await fetch(`${API}/exercises?zones=true`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (res.status === 401) {
    // l'atleta ha revocato l'accesso dal suo account Polar
    await disconnectLocal(userId, false);
    return { ok: false, status: 401, error: 'Accesso Polar revocato' };
  }
  if (res.status === 204) return { ok: true, count: 0 };
  if (!res.ok) return { ok: false, status: res.status, error: 'Polar ha risposto con un errore' };

  const list = await res.json();
  const rows = (Array.isArray(list) ? list : [])
    .map((ex: unknown) => toRow(userId, ex))
    .filter(Boolean);

  if (rows.length > 0) {
    const { error } = await admin
      .from('polar_exercises')
      .upsert(rows as Record<string, unknown>[], { onConflict: 'user_id,polar_exercise_id' });
    if (error) return { ok: false, status: 500, error: error.message };
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
    if (!tokenRes.ok) {
      console.error('Token Polar rifiutato', tokenRes.status, await tokenRes.text());
      return back('errore');
    }
    const tok = await tokenRes.json();
    const accessToken = String(tok.access_token);
    const polarUserId = String(tok.x_user_id);

    // Registra l'utente presso la nostra applicazione Polar (409 = già registrato: va bene)
    const reg = await fetch(`${API}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ 'member-id': userId }),
    });
    if (!reg.ok && reg.status !== 409) {
      console.error('Registrazione utente Polar fallita', reg.status, await reg.text());
      return back('errore');
    }

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
  } catch (e) {
    console.error(e);
    return back('errore');
  }
}

// ---------- 2) notifica di Polar: nuovo allenamento ----------

async function handleWebhook(req: Request) {
  const event = req.headers.get('polar-webhook-event');
  const raw = await req.text();

  // Polar manda un PING quando si crea il webhook: basta rispondere 200
  if (event === 'PING') return new Response('ok', { status: 200 });

  if (!WEBHOOK_SECRET) return new Response('webhook non configurato', { status: 500 });
  const sig = req.headers.get('polar-webhook-signature') ?? '';
  if (!safeEqual(sig, await hmacHex(WEBHOOK_SECRET, raw))) {
    return new Response('firma non valida', { status: 401 });
  }

  if (event !== 'EXERCISE') return new Response('ok', { status: 200 });

  const payload = JSON.parse(raw);
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
      `&state=${encodeURIComponent(state)}`;
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
      // chiede a Polar di scollegare l'utente; se fallisce si procede comunque
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