// Deploys tools/turn-worker/worker.js to Cloudflare as the Worker «nocturne-turn» (W8c). Run by
// .github/workflows/turn-worker.yml with the repository's secrets in the environment — never with keys in a
// file or on the command line; nothing secret is printed. Steps (Cloudflare API v4):
//   1. upload the module with the TURN key as two secret bindings
//   2. switch on its workers.dev address
//   3. ask it once like the game does (Origin: the game's site) and print how many TURN addresses came back
import { readFileSync } from 'node:fs';

const NAME = 'nocturne-turn';
const { CF_ACCOUNT, CF_TOKEN, TURN_KEY_ID, TURN_KEY_API_TOKEN } = process.env;
if (!CF_ACCOUNT || !CF_TOKEN || !TURN_KEY_ID || !TURN_KEY_API_TOKEN) { console.log('::notice::secrets missing: nothing deployed'); process.exit(0); }
const API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers`;
const auth = { Authorization: `Bearer ${CF_TOKEN}` };
async function call(path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(`${init.method || 'GET'} ${path}: ${r.status} ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  return j.result;
}

const code = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const form = new FormData();
form.append('metadata', JSON.stringify({
  main_module: 'worker.js', compatibility_date: '2024-09-23',
  bindings: [{ type: 'secret_text', name: 'TURN_KEY_ID', text: TURN_KEY_ID }, { type: 'secret_text', name: 'TURN_KEY_API_TOKEN', text: TURN_KEY_API_TOKEN }],
}));
form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
await call(`/scripts/${NAME}`, { method: 'PUT', body: form });
console.log(`uploaded ${NAME}`);
await call(`/scripts/${NAME}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
const sub = (await call('/subdomain')).subdomain;
const url = `https://${NAME}.${sub}.workers.dev/`;
console.log(`address: ${url}  (src/config/net.js turnWorker must be this)`);

// a check like the game's (a new address can take a minute to answer)
for (let i = 0; i < 6; i++) {
  try {
    const r = await fetch(url, { headers: { Origin: 'https://archigreen55-prog.github.io' } });
    if (r.ok) {
      const j = await r.json(), list = [].concat(j.iceServers || []), urls = list.flatMap((s) => [].concat(s.urls || []));
      console.log(`check: ${urls.filter((u) => /^turns?:/.test(u)).length} TURN addresses, ${urls.filter((u) => /^stun:/.test(u)).length} STUN, permission for ${j.ttl} s`);
      process.exit(0);
    }
    console.log(`check: ${r.status}, again in 10 s`);
  } catch (e) { console.log(`check: ${String(e.message || e).slice(0, 100)}, again in 10 s`); }
  await new Promise((res) => setTimeout(res, 10000));
}
console.log('::warning::deployed, but the check did not get a permission yet: run the workflow again in a few minutes');
