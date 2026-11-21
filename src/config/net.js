// Playing with friends (plan-multiplayer §1): rooms, the relays that let two browsers find each other,
// how often the host and the guests talk, the time-outs. Only public addresses here: no keys, no tokens
// (the public repository; tests/net.test.mjs checks). TURN: a small Worker gives a 4-hour permission (W8c).
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
  // W8c: the Worker that hands out short-lived TURN permissions (tools/turn-worker/, Cloudflare). Asked only
  // from the game's site (the Worker refuses other pages); no answer in turnTimeout s = STUN only, as before
  turnWorker: 'https://nocturne-turn.archigreen55.workers.dev/',
  turnOrigin: 'https://archigreen55-prog.github.io',
  turnTimeout: 3,
  // how often (per second)
  poseHz: 20,                  // a guest -> the host: where it is, how it moves, its microphone
  stateHz: 15,                 // the host -> everybody: the guards, doors, loot, alarm, clock
  interpDelay: 0.12,           // s: others are drawn this far in the past, between two received poses
  // time-outs, s
  findTimeout: 10,             // looking for the room (per strategy)
  connectTimeout: 15,          // Б10: the host's room: no relay open in this time = «Не можу дістатися серверів зв'язку»
  relayCheck: 2,               // Б10: s between the host's looks at its relays (they come back = the line goes by itself)
  peerLostAfter: 3,            // no packets: «Оля: зв'язок…» (invisible to the guards meanwhile)
  peerGoneAfter: 30,           // then «Оля вийшла»; coming back later = joining anew at the van (Б2: in the middle of a round the place is kept to its end)
  awayDropAfter: 60,           // Б2 (Р1-C): a friend on pause / silent this long drops its item where it stood
  chaseSeen: 3,                // Б2 (owner, 19.11): a pause does not save from a chase — seen by a guard (or chased) in the
  chaseHold: 5,                //   last chaseSeen s: the body stays where it was, visible and catchable, chaseHold s more
  backWait: 4,                 // Б2: a guest back from pause waits this long for the host, then opens the room again itself
  rejoinEvery: 10,             // Б2: while the host is silent the guest tries the room again this often
  startTravel: 1.6,            // s: «Почати» — the van «Їдемо…» for everybody in the room before the round shows (decision of 7.11)
  backFor: 10,                 // Б2: min: a reloaded tab goes back into its room by itself within this time
  hostLostAfter: 10,           // a guest: the host is gone, the round stops for it (Б9: the card «Хост не відповідає…»)
  hostWaitMore: 20,            // Б9: «Чекати» on that card hides it for this long; still silent = the card again
  wakeGrace: 10,               // Б9: a host back from sleep gives every friend this long to be heard again
  // T5 (decision R-11.3, P2): the board at the van is the host's; a guest's board shows the round with only these
  // buttons (they change nothing the others see: «Послухати» plays this player's own scream)
  guestBoard: ['play'],
  maxSpeed: 4,                 // m/s: a guest moving faster than this is held back (a bad packet, not a cheat)
  // the thieves' colours on other screens (story-bible §2.1); the bot later
  thieves: { zoya: 0x8a5cc0, frol: 0xc26a2a, rita: 0xd0405f, nazar: 0x3c8f74 },
};
