// Stealth in the house (the «stealth-house» branch): crouching behind furniture really hides you from a
// guard on the other side of it; standing or crouching in the open does not.
import assert from 'node:assert/strict';
import { browser, open, test, preview } from './runner.mjs';
import { newContext } from './harness.mjs';

const dacha = preview + '?map=dacha';

// Places the player (crouched or standing) and the AI guard (looking at the player), then asks the
// guard's own eyes (patrol.look, the check its detection meter uses) and the wrist read-out.
// cases: [{ name, player: [x, z], guard: [x, z], crouch }]
async function sightCases(page, cases) {
  return page.evaluate((cases) => {
    const g = window.__game, out = {};
    g.playing = true; g.sim(0.1);
    for (const c of cases) {
      g.player.virtualCrouch = !!c.crouch;
      g.player.teleport(c.player[0], c.player[1], 0);
      g.sim(0.6);   // the crouch eases down in 0.3 s
      const p = g.player.head, P = g.patrol;
      P.x = c.guard[0]; P.z = c.guard[1]; P.y = 0; P.headYaw = 0;
      P.heading = Math.atan2(-(p.x - P.x), -(p.z - P.z));   // looking straight at the player (the flashlight on them)
      const seen = P.look(g.player), st = g.stealthState(g.player, g.level, g.guards || P);
      out[c.name] = { visible: seen.visible, d: +seen.d.toFixed(2), range: +seen.range.toFixed(2), hidden: st.hidden, crouched: g.player.crouched, eyes: +p.y.toFixed(2) };
    }
    return out;
  }, cases);
}

test('stealth (crouch): crouched behind the sofa, the armchair, the crates the guard across does not see you (the wrist agrees); standing, in the open, past the end or with the guard on your side it does', async () => {
  const ctx = await newContext(browser);
  const { page, errors } = await open(ctx, dacha);
  const r = await sightCases(page, [
    // the living-room sofa (z -10.4..-9.6, back 0.95 m): you north of it, the guard south of it, 1.5 m / 2 m / 2.5 m away
    { name: 'sofa15', player: [1.5, -10.7], guard: [1.5, -9.2], crouch: true },
    { name: 'sofa2', player: [1.5, -10.7], guard: [1.5, -8.7], crouch: true },
    { name: 'sofa2side', player: [0.6, -10.75], guard: [2.2, -8.6], crouch: true },
    // the library armchair (x -8.7..-7.7, 1.0 m): you west of it, the guard east, 2.5 m away
    { name: 'armchair', player: [-9.0, -11.3], guard: [-6.5, -11.3], crouch: true },
    // the pantry crates (1.25 m): you north of them, the guard south (this worked before too)
    { name: 'crates', player: [5.25, -4.5], guard: [5.25, -1.8], crouch: true },
    // standing behind the same sofa / armchair: seen
    { name: 'sofaStand', player: [1.5, -10.7], guard: [1.5, -8.7], crouch: false },
    { name: 'armchairStand', player: [-9.0, -11.3], guard: [-6.5, -11.3], crouch: false },
    // crouched on the open hall floor, nothing between: seen
    { name: 'open', player: [0.5, -1.5], guard: [0.5, -3.8], crouch: true },
    // crouched behind the sofa, the guard on YOUR side of it (it checks the hiding spot): seen
    { name: 'sameSide', player: [1.5, -10.7], guard: [1.5, -12.6], crouch: true },
    // crouched past the sofa's end (next to it, but it is not between you): seen
    { name: 'pastEnd', player: [-0.75, -10.7], guard: [-0.75, -8.7], crouch: true },
  ]);
  for (const k of ['sofa15', 'sofa2', 'sofa2side', 'armchair', 'crates']) {
    assert.equal(r[k].crouched, true, `${k}: crouched ${JSON.stringify(r[k])}`);
    assert.ok(r[k].d < r[k].range, `${k}: within its sight range, so only the cover can hide you ${JSON.stringify(r[k])}`);
    assert.equal(r[k].visible, false, `${k}: crouched behind cover the guard across does not see you ${JSON.stringify(r[k])}`);
    assert.equal(r[k].hidden, true, `${k}: the wrist says hidden ${JSON.stringify(r[k])}`);
  }
  for (const k of ['sofaStand', 'armchairStand', 'open', 'sameSide', 'pastEnd']) {
    assert.ok(r[k].d < r[k].range, `${k}: within its sight range ${JSON.stringify(r[k])}`);
    assert.equal(r[k].visible, true, `${k}: seen ${JSON.stringify(r[k])}`);
    assert.equal(r[k].hidden, false, `${k}: the wrist does not say hidden ${JSON.stringify(r[k])}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
