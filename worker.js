/**
 * EliteTech Cloudflare Worker — v4.1
 * Includes Web Push Notification support
 *
 * Secrets required in Cloudflare Worker Settings:
 *   GITHUB_TOKEN      — GitHub Personal Access Token
 *   ANTHROPIC_KEY     — Anthropic API Key
 *   VAPID_PRIVATE_KEY — From https://web-push-codelab.glitch.me/
 *   VAPID_PUBLIC_KEY  — From https://web-push-codelab.glitch.me/
 *   VAPID_SUBJECT     — mailto:youremail@gmail.com
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GITHUB_REPO = 'samusts/PKSamustsEliteTech';
const DB_FILE     = 'db.json';
const SUBS_FILE   = 'subscribers.json';

// Simple in-memory rate limiter
const rateLimits = new Map();
function checkRate(ip, action, max, windowMs = 60000) {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const e = rateLimits.get(key) || { n: 0, reset: now + windowMs };
  if (now > e.reset) { e.n = 0; e.reset = now + windowMs; }
  e.n++;
  rateLimits.set(key, e);
  return e.n <= max;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
function err(msg, status = 400) { return json({ error: msg }, status); }

async function ghGet(file, token) {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'EliteTech/4.1' }
  });
}

async function ghPut(file, content, sha, message, token) {
  const body = { message, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'EliteTech/4.1' },
    body: JSON.stringify(body)
  });
}

// Web Push helpers
function encodeBase64URL(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sendWebPush(subscription, payload, vapidPrivate, vapidPublic, vapidSubject) {
  const endpoint = subscription.endpoint;
  const keys = subscription.keys;

  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = { aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: vapidSubject };

  const enc = new TextEncoder();
  const headerB64  = encodeBase64URL(enc.encode(JSON.stringify(header)));
  const claimsB64  = encodeBase64URL(enc.encode(JSON.stringify(claims)));
  const sigInput   = `${headerB64}.${claimsB64}`;

  // Import VAPID private key
  const privKeyBytes = Uint8Array.from(atob(vapidPrivate.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', privKeyBytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, enc.encode(sigInput));
  const jwt = `${sigInput}.${encodeBase64URL(sig)}`;

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidPublic}`,
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body: enc.encode(JSON.stringify(payload))
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url  = new URL(request.url);
    const path = url.pathname;
    const ip   = request.headers.get('CF-Connecting-IP') || 'unknown';

    try {
      // ── AI Chat ───────────────────────────────────────────────
      if (path === '/ai' && request.method === 'POST') {
        if (!checkRate(ip, 'ai', 20)) return err('Rate limit exceeded', 429);
        const body = await request.json();
        if (!body.messages) return err('Invalid request');
        const messages = body.messages.slice(-10).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content).slice(0, 2000)
        }));
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: body.model || 'claude-sonnet-4-20250514', max_tokens: 1000, system: String(body.system || '').slice(0, 3000), messages })
        });
        if (!res.ok) return err('AI unavailable', 503);
        return json(await res.json());
      }

      // ── DB Read ───────────────────────────────────────────────
      if (path === '/db' && request.method === 'GET') {
        const res = await ghGet(DB_FILE, env.GITHUB_TOKEN);
        if (!res.ok) return err('DB read failed', 502);
        return json(await res.json());
      }

      // ── DB Write ──────────────────────────────────────────────
      if (path === '/db' && request.method === 'PUT') {
        if (!checkRate(ip, 'db', 30)) return err('Rate limit', 429);
        const body = await request.json();
        if (!body.content || !body.message) return err('Invalid format');
        // Validate JSON structure
        try {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(body.content.replace(/\n/g, '')))));
          if (!decoded.products) return err('Invalid DB structure');
        } catch { return err('Corrupted content rejected'); }
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${DB_FILE}`, {
          method: 'PUT',
          headers: { Authorization: `token ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'EliteTech/4.1' },
          body: JSON.stringify(body)
        });
        if (!res.ok) return err('DB write failed', 502);
        const data = await res.json();
        return json({ success: true, sha: data.content?.sha });
      }

      // ── Review Moderation ─────────────────────────────────────
      if (path === '/moderate' && request.method === 'POST') {
        if (!checkRate(ip, 'moderate', 10)) return err('Rate limit', 429);
        const { name, text } = await request.json();
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, system: 'Moderate reviews for EliteTech tech store. Reply ONLY "APPROVE" or "REJECT".', messages: [{ role: 'user', content: `By ${String(name).slice(0,50)}: "${String(text).slice(0,500)}"` }] })
        });
        const data = await res.json();
        const verdict = data.content?.[0]?.text?.trim().toUpperCase() || 'REJECT';
        return json({ verdict: verdict.includes('APPROVE') ? 'APPROVE' : 'REJECT' });
      }

      // ── Push Subscribe ────────────────────────────────────────
      if (path === '/push/subscribe' && request.method === 'POST') {
        if (!checkRate(ip, 'push-sub', 5)) return err('Rate limit', 429);
        const { subscription } = await request.json();
        if (!subscription?.endpoint) return err('Invalid subscription');

        // Load existing subscribers
        let subs = [];
        let sha = null;
        const res = await ghGet(SUBS_FILE, env.GITHUB_TOKEN);
        if (res.ok) {
          const data = await res.json();
          sha = data.sha;
          try { subs = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))); } catch {}
        }

        // Add if not exists
        const exists = subs.find(s => s.endpoint === subscription.endpoint);
        if (!exists) {
          subs.push({ ...subscription, addedAt: Date.now() });
          await ghPut(SUBS_FILE, JSON.stringify(subs), sha, 'Add push subscriber', env.GITHUB_TOKEN);
        }
        return json({ success: true, total: subs.length });
      }

      // ── Push Send (admin only) ────────────────────────────────
      if (path === '/push/send' && request.method === 'POST') {
        if (!checkRate(ip, 'push-send', 10)) return err('Rate limit', 429);
        const { title, body: msgBody, url: msgUrl, icon } = await request.json();
        if (!title || !msgBody) return err('Title and body required');

        // Load subscribers
        const res = await ghGet(SUBS_FILE, env.GITHUB_TOKEN);
        if (!res.ok) return json({ sent: 0, message: 'No subscribers yet' });
        const data = await res.json();
        let subs = [];
        try { subs = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))); } catch {}
        if (!subs.length) return json({ sent: 0 });

        const payload = { title, body: msgBody, icon: icon || '/PKSamustsEliteTech/icon.png', url: msgUrl || '/', badge: '/PKSamustsEliteTech/icon.png', timestamp: Date.now() };

        let sent = 0;
        const failed = [];
        for (const sub of subs) {
          try {
            const r = await sendWebPush(sub, payload, env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, env.VAPID_SUBJECT);
            if (r.ok || r.status === 201) { sent++; }
            else if (r.status === 410 || r.status === 404) { failed.push(sub.endpoint); } // expired
          } catch(e) { failed.push(sub.endpoint); }
        }

        // Remove failed/expired subscriptions
        if (failed.length > 0) {
          const validSubs = subs.filter(s => !failed.includes(s.endpoint));
          const sha2 = data.sha;
          await ghPut(SUBS_FILE, JSON.stringify(validSubs), sha2, 'Remove expired subscribers', env.GITHUB_TOKEN);
        }

        return json({ success: true, sent, failed: failed.length });
      }

      // ── Health ────────────────────────────────────────────────
      if (path === '/health') {
        return json({ status: 'ok', worker: 'EliteTech v4.1', push: !!env.VAPID_PRIVATE_KEY, time: new Date().toISOString() });
      }

      return err('Not found', 404);

    } catch(e) {
      console.error('Worker error:', e);
      return err('Internal server error', 500);
    }
  }
};
