import { createClient } from '@supabase/supabase-js';

let client = null;
let initPromise = null;
let cfgCache = null;

async function init() {
  if (client) return client;
  if (!initPromise) {
    initPromise = (async () => {
      const r = await fetch('/api/config');
      const d = await r.json().catch(() => ({}));
      if (!d.ok || !d.supabaseUrl || !d.supabaseAnonKey) {
        throw new Error(d.error || 'Supabase belum dikonfigurasi di server.');
      }
      cfgCache = d;
      client = createClient(d.supabaseUrl, d.supabaseAnonKey);
      return client;
    })();
  }
  return initPromise;
}

// Site key Cloudflare Turnstile ('' bila captcha belum dikonfigurasi)
export async function getTurnstileSiteKey() {
  try {
    if (!cfgCache) await init();
    return cfgCache?.turnstileSiteKey || '';
  } catch { return ''; }
}

// Klien Supabase (pastikan sudah init lewat getSupabase lebih dulu)
export async function getSupabase() {
  return init();
}

export async function getSession() {
  const sb = await init();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export async function getToken() {
  const s = await getSession().catch(() => null);
  return s?.access_token || '';
}

export async function getUser() {
  const s = await getSession().catch(() => null);
  return s?.user || null;
}
