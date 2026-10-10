// Playing with friends (plan-multiplayer §1): rooms, the relays that let two browsers find each other,
// how often the host and the guests talk, the time-outs. Only public addresses here: no keys, no tokens
// (the public repository; tests/net.test.mjs checks). TURN comes later through a small Worker (W8c).
export const net = {
  protocol: 'p1',              // a new number = a new space of rooms: old and new builds never meet
  appId: 'nocturne-vr/p1',
  codeDigits: 6,               // the room code: 6 digits, shown as «483 921»
  maxThieves: 4,
  // the browsers find each other through public relays (Trystero, plan §1.2): first Nostr, then the
  // BitTorrent trackers if nobody answered in findTimeout s (another kind of server, other ports)
  strategies: ['nostr', 'torrent'],
  relays: {                    // [] = the library's own list (Trystero keeps ~30 live Nostr relays / 3 trackers)
    nostr: [],
    torrent: [],
  },
  stun: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'],
  turnWorker: '',              // W8c: the Worker that hands out short-lived TURN keys (Cloudflare); '' = no TURN
  // how often (per second)
  poseHz: 20,                  // a guest -> the host: where it is, how it moves, its microphone
  stateHz: 15,                 // the host -> everybody: the guards, doors, loot, alarm, clock
  interpDelay: 0.12,           // s: others are drawn this far in the past, between two received poses
  // time-outs, s
  findTimeout: 10,             // looking for the room (per strategy)
  connectTimeout: 15,
  peerLostAfter: 3,            // no packets: «Оля: зв'язок…» (invisible to the guards meanwhile)
  peerGoneAfter: 30,           // then «Оля вийшла»; coming back later = joining anew at the van
  hostLostAfter: 10,           // a guest: the host is gone, the round stops for it
  maxSpeed: 4,                 // m/s: a guest moving faster than this is held back (a bad packet, not a cheat)
  // the thieves' colours on other screens (story-bible §2.1); the bot later
  thieves: { zoya: 0x8a5cc0, frol: 0xc26a2a, rita: 0xd0405f, nazar: 0x3c8f74 },
};
