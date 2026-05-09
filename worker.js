// EliteTech Cloudflare Worker Proxy
// Deploy this on Cloudflare Workers
// Add GITHUB_TOKEN and ANTHROPIC_KEY as Worker secrets

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── AI Chat proxy ──────────────────────────────────────────
    if (path === '/ai') {
      const body = await request.json();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── GitHub DB read ─────────────────────────────────────────
    if (path === '/db' && request.method === 'GET') {
      const res = await fetch(
        'https://api.github.com/repos/samusts/PKSamustsEliteTech/contents/db.json',
        {
          headers: {
            Authorization: 'token ' + env.GITHUB_TOKEN,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── GitHub DB write ────────────────────────────────────────
    if (path === '/db' && request.method === 'PUT') {
      const body = await request.json();
      const res = await fetch(
        'https://api.github.com/repos/samusts/PKSamustsEliteTech/contents/db.json',
        {
          method: 'PUT',
          headers: {
            Authorization: 'token ' + env.GITHUB_TOKEN,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
