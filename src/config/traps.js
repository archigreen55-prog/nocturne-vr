// Traps (W2b): bought in the shop (consumables), they lie in the van at the start of a round; put one
// down and the guard who steps on it (opens the door with the bucket, walks through the rope) is
// knocked out for a while, then angry. Mischief points and combos; contract 7 «Довгий вечір Петровича».
// Units: metres, seconds, m/s (see src/config/index.js).

export const traps = {
  limit: 3,              // traps in the van per round (contract 7: limit x its mods.trapsK)
  // kind: price ($), where it goes (floor / door / doorway), how it trips, what it does to the guard:
  //   stun: s knocked out in `pose`; then `after` steps (s; mods while it lasts); radius: m around it
  kinds: {
    soap: { price: 150, place: 'floor', radius: 0.35, stun: 6, pose: 'flip', after: { t: 5, act: 'flashlight', sightK: 0.3 } },
    marbles: { price: 150, place: 'floor', radius: 1.0, stun: 3, pose: 'flip', after: { t: 15, act: 'marbles', hearK: 0.5, fovK: 0.3, pose: 'kneel' } },
    bucket: { price: 200, place: 'door', stun: 0.8, pose: 'bucket', blind: 6, off: 3 },
    clock: { price: 300, place: 'floor', delay: 30, ring: 20, noise: 10, every: 1.5 },   // not a knock-out: it rings, the guard goes to switch it off
    rope: { price: 150, place: 'doorway', radius: 0.4, stun: 3, pose: 'kneel' },
  },
  order: ['soap', 'marbles', 'bucket', 'clock', 'rope'],
  // after a knock-out (decision R4 A): suspicion, faster for a while; never a full alarm by itself
  after: { points: 35, angryK: 1.1, angryFor: 60 },
  againDelay: 3,         // the same kind again (decision R5 A): it sees it, «Не цього разу», picks it up (s)
  seeAhead: 1.2,         // m: it notices a trap of a kind it already fell for this close
  stunK: { easy: 1.2, medium: 1, hard: 0.8 },   // knock-outs on easy last longer, on hard shorter
  self: { noise: 8, slide: 0.5 },               // you on your own soap / marbles: a fall noise; a slide (phone, PC; not in VR)
  // mischief points (decision R6 A) and combos: the next one within `window` s x2, then x3
  points: { trap: 100, device: 50, throw: 30, hit: 50 },
  combo: { window: 10, max: 3 },
  // contract 7 (decision R7 A): the goal, ★★ at `bonus` points or a x`comboStars` combo
  evening: { goal: 500, bonus: 1000, comboStars: 3 },
  doorReach: 1.2,        // phone / PC: «Покласти» this close to a door puts the bucket on it / the rope across it
  vrDoor: { top: 1.75, reach: 0.7, low: 1.1 },  // VR: let go of the bucket above `top` m within `reach` of a door; the rope below `low`
};
