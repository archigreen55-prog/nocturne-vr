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
// tests: ms, ms, 0..1; cut = nothing goes in or out; strategies = the local kind has a channel per kind of
// relay (as Trystero does); blockStrategy = a guest hears nobody on that one; failConnect = a guest sees
// the host but cannot connect (as two phones in different networks without TURN)
export const sim = { lag: 0, jitter: 0, loss: 0, cut: false, strategies: false, blockStrategy: '', failConnect: false };

// opts.all (the host): the room is open on every kind of relay at once, so a guest finds it on whichever
// one it tries (T3: the host stayed on Nostr while a guest that found nobody in time moved to the
// trackers, where nobody would ever be). A guest uses one kind at a time (nextStrategy).
export async function openTransport(opts) {
  const local = opts.kind === 'local';
  const strategies = local && !sim.strategies ? [null] : CFG.net.strategies;
  const openOne = local ? openLocal : openTrystero;
  const subs = [], roomOf = new Map(), d = { kind: local ? 'local' : 'trystero', tried: [], errors: [], connectFail: 0 };
  let closed = false;
  const wrap = (strategy) => ({
    ...opts, strategy, guest: !opts.all,
    onMessage: (m, id) => { roomOf.set(id, sub(strategy)); opts.onMessage(m, id); },
    onPeerJoin: (id) => { roomOf.set(id, sub(strategy)); opts.onPeerJoin(id); },
    onPeerLeave: (id) => { roomOf.delete(id); opts.onPeerLeave(id); },
    onStatus: (s) => { if (s.step === 'connectFail') d.connectFail++; if (opts.onStatus) opts.onStatus(s); },
  });
  const sub = (strategy) => subs.find((x) => x.strategy === strategy);
  async function join(strategy) {
    d.tried.push(strategy);
    const t = await openOne(wrap(strategy));
    t.strategy = strategy; subs.push(t);
  }
  if (opts.all) {
    await Promise.all(strategies.map((s) => join(s).catch((e) => d.errors.push(`${s}: load ${String(e.message || e).slice(0, 80)}`))));
  } else {
    for (const s of strategies) { try { await join(s); break; } catch (e) { d.errors.push(`${s}: load ${String(e.message || e).slice(0, 80)}`); } }
  }
  if (!subs.length) throw new Error(d.errors.join('; ') || 'no strategy');
  return {
    kind: d.kind,
    get selfId() { return subs[0] ? subs[0].selfId : ''; },
    send(msg, to) {
      if (!to) { for (const t of subs) t.send(msg); return; }
      for (const id of [].concat(to)) { const t = roomOf.get(id) || subs[0]; if (t) t.send(msg, id); }
    },
    peers: () => subs.flatMap((t) => t.peers()),
    ping: (id) => (roomOf.get(id) || subs[0]).ping(id),
    // a guest that found nobody in time tries the next kind of relay; false = there is none (or it left)
    async nextStrategy() {
      const cur = subs[subs.length - 1], L = strategies, i = L.indexOf(cur && cur.strategy);
      if (opts.all || i < 0 || i >= L.length - 1) return false;
      subs.length = 0; roomOf.clear();
      await cur.close();
      if (closed) return false;
      await join(L[i + 1]);
      if (closed) { for (const t of subs) t.close(); return false; }
      return true;
    },
    close() { closed = true; for (const t of subs) t.close(); },
    diag: () => ({ ...d, strategies: subs.map((t) => t.strategy), strategy: subs.length ? subs[subs.length - 1].strategy : null, peers: subs.reduce((n, t) => n + t.peers().length, 0), errors: d.errors.concat(...subs.map((t) => (t.diag().errors || []))).slice(-5) }),
  };
}

// ---------- local: BroadcastChannel (same browser, same site) ----------
function openLocal({ code, strategy, guest, onMessage, onPeerJoin, onPeerLeave, onStatus }) {
  const selfId = randomId('L');
  const ch = new BroadcastChannel(`nocturne-net-${CFG.net.appId}-${strategy ? strategy + '-' : ''}${code}`);
  const deaf = guest && strategy && sim.blockStrategy === strategy;
  const peers = new Map();   // id -> last heard (ms)
  const deliver = (fn) => { const d = sim.lag + Math.random() * sim.jitter; if (d > 0) setTimeout(fn, d); else fn(); };
  const post = (o) => { if (!sim.cut && !deaf) ch.postMessage(o); };
  const failed = new Set();
  const seen = (id) => {
    if (guest && sim.failConnect) { if (!failed.has(id)) { failed.add(id); if (onStatus) onStatus({ step: 'connectFail', strategy }); } return false; }
    const fresh = !peers.has(id);
    peers.set(id, performance.now());
    if (fresh) { post({ hi: selfId, to: id }); onPeerJoin(id); }
    return true;
  };
  ch.onmessage = ({ data: o }) => {
    if (sim.cut || deaf || !o || o.from === selfId) return;
    if (o.hi) { if (!o.to || o.to === selfId) seen(o.hi); return; }
    if (o.bye) { if (peers.delete(o.bye)) onPeerLeave(o.bye); return; }
    if (o.to && o.to !== selfId) return;
    if (!seen(o.from)) return;
    if (LOSSY.has(o.msg && o.msg.type) && Math.random() < sim.loss) return;
    deliver(() => onMessage(o.msg, o.from));
  };
  post({ hi: selfId });
  if (onStatus) onStatus({ step: 'room', strategy: strategy || 'local' });
  return {
    kind: 'local', selfId,
    send(msg, to) { const ids = to ? [].concat(to) : [null]; for (const id of ids) post({ from: selfId, to: id, msg }); },
    peers: () => [...peers.keys()],
    ping: async () => sim.lag * 2,
    close() { post({ bye: selfId }); ch.close(); },
    diag: () => ({ kind: 'local', peers: peers.size }),
  };
}

// ---------- trystero: WebRTC through public relays (one kind of relay) ----------
const LIBS = { nostr: () => import('trystero-nostr'), torrent: () => import('trystero-torrent') };

async function openTrystero({ code, strategy, onMessage, onPeerJoin, onPeerLeave, onStatus }) {
  const N = CFG.net;
  const errors = [];
  const iceServers = N.stun.map((urls) => ({ urls }));
  const peers = new Set();
  if (onStatus) onStatus({ step: 'find', strategy });
  const lib = await LIBS[strategy]();
  const urls = N.relays[strategy] || [];
  const room = lib.joinRoom({ appId: N.appId, rtcConfig: { iceServers }, ...(urls.length ? { relayConfig: { urls } } : {}) }, code, {
    onJoinError: (e) => {
      const msg = String((e && e.error) || e);
      errors.push(`${strategy}: ${msg.slice(0, 80)}`);
      // the other browser was found through the relay, the direct connection failed (no TURN, different networks)
      if (e && e.peerId && /could not connect to peer/.test(msg) && onStatus) onStatus({ step: 'connectFail', strategy });
    },
  });
  const act = room.makeAction('m');
  act.onMessage = (data, ctx) => { peers.add(ctx.peerId); onMessage(data, ctx.peerId); };
  room.onPeerJoin = (id) => { peers.add(id); onPeerJoin(id); };
  room.onPeerLeave = (id) => { peers.delete(id); onPeerLeave(id); };
  if (onStatus) onStatus({ step: 'room', strategy });
  return {
    kind: 'trystero', selfId: lib.selfId,
    send(msg, to) { act.send(msg, to ? { target: to } : undefined).catch((e) => errors.push(String(e.message || e).slice(0, 80))); },
    peers: () => [...peers],
    ping: (id) => room.ping(id),
    close: () => room.leave(),
    diag: () => ({ errors: errors.slice(-5) }),
  };
}
