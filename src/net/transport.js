// How the browsers of one room talk (plan-multiplayer §1.2). One small interface, two kinds:
//   trystero  the real one: WebRTC between the browsers, found through public relays (Nostr, then the
//             BitTorrent trackers); loaded only when a room is opened (solo play never downloads it)
//   local     the browsers of this computer, through BroadcastChannel: the tests (two tabs of one
//             Chromium) and a quick look on one PC (?net=local); lag and loss can be added for tests
// A message is a plain object; `type` names it. pose / state are "unreliable": the local kind may drop
// them on purpose (net.loss), as a real network would; the rest always arrive.
//   const t = await openTransport({ kind, code, onMessage(msg, from), onPeerJoin(id), onPeerLeave(id), onStatus(s) })
//   t.selfId, t.send(msg, to?), t.peers(), t.ping(id), t.close(), t.diag()
import { CFG } from '../config/index.js';
import { randomId } from './room.js';

const LOSSY = new Set(['pose', 'state']);
export const sim = { lag: 0, jitter: 0, loss: 0, cut: false };   // tests: ms, ms, 0..1; cut = nothing goes in or out

export async function openTransport(opts) {
  return opts.kind === 'local' ? openLocal(opts) : openTrystero(opts);
}

// ---------- local: BroadcastChannel (same browser, same site) ----------
function openLocal({ code, onMessage, onPeerJoin, onPeerLeave, onStatus }) {
  const selfId = randomId('L');
  const ch = new BroadcastChannel(`nocturne-net-${CFG.net.appId}-${code}`);
  const peers = new Map();   // id -> last heard (ms)
  const deliver = (fn) => { const d = sim.lag + Math.random() * sim.jitter; if (d > 0) setTimeout(fn, d); else fn(); };
  const post = (o) => { if (!sim.cut) ch.postMessage(o); };
  const seen = (id) => {
    const fresh = !peers.has(id);
    peers.set(id, performance.now());
    if (fresh) { post({ hi: selfId, to: id }); onPeerJoin(id); }
  };
  ch.onmessage = ({ data: o }) => {
    if (sim.cut || !o || o.from === selfId) return;
    if (o.hi) { if (!o.to || o.to === selfId) seen(o.hi); return; }
    if (o.bye) { if (peers.delete(o.bye)) onPeerLeave(o.bye); return; }
    if (o.to && o.to !== selfId) return;
    seen(o.from);
    if (LOSSY.has(o.msg && o.msg.type) && Math.random() < sim.loss) return;
    deliver(() => onMessage(o.msg, o.from));
  };
  post({ hi: selfId });
  if (onStatus) onStatus({ step: 'room', strategy: 'local' });
  return {
    kind: 'local', selfId,
    send(msg, to) { const ids = to ? [].concat(to) : [null]; for (const id of ids) post({ from: selfId, to: id, msg }); },
    peers: () => [...peers.keys()],
    ping: async () => sim.lag * 2,
    close() { post({ bye: selfId }); ch.close(); },
    diag: () => ({ kind: 'local', peers: peers.size }),
  };
}

// ---------- trystero: WebRTC through public relays ----------
const LIBS = { nostr: () => import('trystero-nostr'), torrent: () => import('trystero-torrent') };

async function openTrystero({ code, onMessage, onPeerJoin, onPeerLeave, onStatus }) {
  const N = CFG.net;
  const d = { kind: 'trystero', strategy: null, tried: [], foundAfter: null, errors: [] };
  const t0 = performance.now();
  const iceServers = N.stun.map((urls) => ({ urls }));
  const peers = new Set();
  let room = null, act = null, lib = null;
  async function join(strategy) {
    if (onStatus) onStatus({ step: 'find', strategy });
    d.tried.push(strategy);
    lib = await LIBS[strategy]();
    const urls = N.relays[strategy] || [];
    room = lib.joinRoom({ appId: N.appId, rtcConfig: { iceServers }, ...(urls.length ? { relayConfig: { urls } } : {}) }, code,
      { onJoinError: (e) => d.errors.push(`${strategy}: ${String(e.error).slice(0, 80)}`) });
    act = room.makeAction('m');
    act.onMessage = (data, ctx) => { peers.add(ctx.peerId); onMessage(data, ctx.peerId); };
    room.onPeerJoin = (id) => { peers.add(id); if (d.foundAfter === null) d.foundAfter = +((performance.now() - t0) / 1000).toFixed(1); onPeerJoin(id); };
    room.onPeerLeave = (id) => { peers.delete(id); onPeerLeave(id); };
    d.strategy = strategy;
    if (onStatus) onStatus({ step: 'room', strategy });
  }
  for (const strategy of N.strategies) {
    try { await join(strategy); break; } catch (e) { d.errors.push(`${strategy}: load ${String(e.message || e).slice(0, 80)}`); room = null; }
  }
  if (!room) throw new Error(d.errors.join('; ') || 'no strategy');
  return {
    kind: 'trystero',
    get selfId() { return lib.selfId; },
    send(msg, to) { act.send(msg, to ? { target: to } : undefined).catch((e) => d.errors.push(String(e.message || e).slice(0, 80))); },
    peers: () => [...peers],
    ping: (id) => room.ping(id),
    connections: () => room.getPeers(),
    // a guest that found nobody in time tries the next kind of relay; false = there is none
    async nextStrategy() {
      const i = N.strategies.indexOf(d.strategy);
      if (i < 0 || i >= N.strategies.length - 1) return false;
      await room.leave();
      await join(N.strategies[i + 1]);
      return true;
    },
    close() { room.leave(); },
    diag: () => ({ ...d, peers: peers.size, errors: d.errors.slice(-5) }),
  };
}
