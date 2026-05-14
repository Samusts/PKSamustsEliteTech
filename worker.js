/**
 * EliteTech Cloudflare Worker — v4.0
 * Secure API Gateway for EliteTech Store
 * 
 * Secrets required (Cloudflare Dashboard > Worker > Settings > Variables):
 *   GITHUB_TOKEN — GitHub Personal Access Token
 *   ANTHROPIC_KEY — Anthropic API Key
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Request-ID',
};

const GITHUB_REPO = 'samusts/PKSamustsEliteTech';
const DB_FILE = 'db.json';
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_AI_REQUESTS = 20; // per window
const MAX_DB_WRITES = 30;  // per window

// In-memory rate limiter (resets on worker restart)
const rateLimits = new Map();

function checkRateLimit(ip, action, max) {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW };
  
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_LIMIT_WINDOW;
  }
  
  entry.count++;
  rateLimits.set(key, entry);
  
  if (entry.count > max) {
    return false; // Rate limited
  }
  return true;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    try {
      // ── AI Chat ──────────────────────────────────────────────
      if (path === '/ai' && request.method === 'POST') {
        if (!checkRateLimit(ip, 'ai', MAX_AI_REQUESTS)) {
          return errorResponse('Rate limit exceeded. Please wait before sending more messages.', 429);
        }

        const body = await request.json();
        
        // Validate request
        if (!body.messages || !Array.isArray(body.messages)) {
          return errorResponse('Invalid request format');
        }
        
        // Sanitize messages
        const messages = body.messages.slice(-10).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content).slice(0, 2000) // Limit message length
        }));

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: body.model || 'claude-sonnet-4-20250514',
            max_tokens: Math.min(body.max_tokens || 1000, 1000),
            system: body.system ? String(body.system).slice(0, 3000) : 'You are EliteTech AI assistant.',
            messages
          })
        });

        if (!res.ok) {
          const err = await res.text();
          console.error('Anthropic error:', err);
          return errorResponse('AI service temporarily unavailable', 503);
        }

        const data = await res.json();
        return jsonResponse(data);
      }

      // ── DB Read ──────────────────────────────────────────────
      if (path === '/db' && request.method === 'GET') {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${DB_FILE}`,
          {
            headers: {
              Authorization: `token ${env.GITHUB_TOKEN}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'EliteTech-Worker/4.0'
            }
          }
        );

        if (!res.ok) {
          return errorResponse('Database read failed', 502);
        }

        const data = await res.json();
        return jsonResponse(data);
      }

      // ── DB Write ─────────────────────────────────────────────
      if (path === '/db' && request.method === 'PUT') {
        if (!checkRateLimit(ip, 'db-write', MAX_DB_WRITES)) {
          return errorResponse('Too many write requests. Please wait.', 429);
        }

        const body = await request.json();
        
        // Validate body structure
        if (!body.content || !body.message) {
          return errorResponse('Invalid database write format');
        }

        // Validate JSON content (decode and re-encode)
        try {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(body.content.replace(/\n/g, '')))));
          if (!decoded.products || !Array.isArray(decoded.products)) {
            return errorResponse('Invalid database structure');
          }
        } catch(e) {
          return errorResponse('Corrupted database content rejected');
        }

        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${DB_FILE}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `token ${env.GITHUB_TOKEN}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'EliteTech-Worker/4.0'
            },
            body: JSON.stringify(body)
          }
        );

        if (!res.ok) {
          const err = await res.text();
          console.error('GitHub write error:', err);
          return errorResponse('Database write failed', 502);
        }

        const data = await res.json();
        return jsonResponse({ success: true, sha: data.content?.sha });
      }

      // ── Review Moderation ────────────────────────────────────
      if (path === '/moderate' && request.method === 'POST') {
        if (!checkRateLimit(ip, 'moderate', 10)) {
          return errorResponse('Rate limit exceeded', 429);
        }

        const { name, text } = await request.json();
        
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            system: 'You moderate reviews for EliteTech tech store in Maiduguri, Nigeria. Reply ONLY "APPROVE" or "REJECT". Approve genuine positive/neutral reviews. Reject spam, offensive content, fake reviews, or content that harms the store.',
            messages: [{ role: 'user', content: `Review by ${String(name).slice(0,50)}: "${String(text).slice(0,500)}"` }]
          })
        });

        const data = await res.json();
        const verdict = data.content?.[0]?.text?.trim().toUpperCase() || 'REJECT';
        return jsonResponse({ verdict: verdict.includes('APPROVE') ? 'APPROVE' : 'REJECT' });
      }

      // ── Health Check ─────────────────────────────────────────
      if (path === '/health') {
        return jsonResponse({ 
          status: 'ok', 
          worker: 'EliteTech v4.0',
          timestamp: new Date().toISOString()
        });
      }

      return errorResponse('Route not found', 404);

    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('Internal server error', 500);
    }
  }
};
