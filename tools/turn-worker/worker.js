// HUSH JOB's TURN Worker (W8c, docs: guide-cloudflare-turn). A Cloudflare Worker that hands the game a
// short-lived TURN permission (4 h) so two phones on mobile networks can still meet. The TURN key is the
// Worker's secret (TURN_KEY_ID, TURN_KEY_API_TOKEN, set by .github/workflows/turn-worker.yml from the repo's
// secrets): nothing secret is in this file. Only the game's pages may ask, a few times a minute per address.
const ORIGIN = 'https://archigreen55-prog.github.io';
const TTL = 4 * 3600;          // s: how long a permission lives
const PER_MIN = 6;             // asks per minute from one address (this copy's memory: a brake, not a wall)
const seen = new Map();        // ip -> times of its asks (ms)

export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, Vary: 'Origin', 'Cache-Control': 'no-store' };
    if (req.headers.get('Origin') !== ORIGIN) return new Response('forbidden', { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });
    const ip = req.headers.get('CF-Connecting-IP') || '?', now = Date.now();
    const times = (seen.get(ip) || []).filter((t) => now - t < 60000);
    if (times.length >= PER_MIN) return new Response('too many', { status: 429, headers: { ...cors, 'Retry-After': '60' } });
    times.push(now); seen.set(ip, times);
    if (seen.size > 10000) seen.clear();
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: TTL }),
    });
    if (!r.ok) return new Response('turn unavailable', { status: 502, headers: cors });
    const { iceServers } = await r.json();
    return Response.json({ iceServers, ttl: TTL }, { headers: cors });
  },
};
