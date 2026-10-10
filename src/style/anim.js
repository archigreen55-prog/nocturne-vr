// W17 «Стиль» S2: the figures' moves — functions of time and of the state the game already has (speed,
// the gaze, a trap's pose, a habit, crouching). They only turn bones: nothing the game reads changes
// (the simulation trace is the same with the style on or off).
import { S } from '../i18n/index.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// eases each bone's rotation towards the target: changes of pose blend in ~0.15 s
function ease(b, x, y, z, k) { b.rotation.x = lerp(b.rotation.x, x, k); b.rotation.y = lerp(b.rotation.y, y, k); b.rotation.z = lerp(b.rotation.z, z, k); }

// What a guard is doing, from what it already shows: a habit, a yawn, sitting
function habitOf(p) {
  const q = p.queue && p.queue[0];
  if (p.sitting) return 'sit';
  if (!q) return null;
  const L = q.label;
  if (L === S.guard.act.yawns) return 'yawn';
  if (q.type === 'wait' && (L === S.guard.habits.tea || (S.mansion && L === S.mansion.guard.coffee))) return 'cup';
  if (L === S.guard.habits.phone) return 'phone';
  return null;
}

// Signs (bones hang down, the face looks to -Z): rotation.x > 0 swings a leg or an arm forward (and an arm
// on up over the head), tilts the head up, leans the torso back.

// a guard (enemies/patrol.js): legs and the free arm swing with its steps (patrol.phase, the same as its
// bob), the torso turns with the gaze (the flashlight is in that hand), habits, the traps' poses (W2b),
// Pozikhailo on the shoulder leaves when the guard is angry (W2b «злий: тінь злізла з плеча»)
export function animateGuard(p, dt, t) {
  const f = p.fig, B = f.bones, k = 1 - Math.exp(-dt / 0.12);
  const walk = clamp(p.speed / 1.1, 0, 1.4), sw = Math.sin(p.phase) * 0.55 * walk;
  const pose = p.pose, habit = pose ? null : habitOf(p), chase = p.state === 'chase' || p.state === 'hunt';
  const P0 = f.pivots;
  let legL = sw, legR = -sw, armLx = -sw * 0.8, armLz = 0.08, torsoX = (chase ? -0.18 : 0) + (P0.slouch || 0), headX = P0.slouch ? -0.25 : 0, headZ = 0;
  if (f.who === 'zhora' && !chase) { armLx = 1.1; armLz = 0.35; }   // Zhora reads his phone
  if (pose === 'flip') { legL = 0.7; legR = 0.45; armLx = 1.2; armLz = -0.9; headX = -0.2; }
  else if (pose === 'kneel') { legL = -1.45; legR = -1.45; torsoX = -0.35; armLx = 0.9 + 0.3 * Math.sin(t * 6); armLz = 0.1; headX = -0.3; }
  else if (pose === 'bucket') { armLx = 2.7 + 0.25 * Math.sin(t * 9); armLz = 0.35; legL = 0.15 * Math.sin(t * 5); legR = -legL; }
  else if (habit === 'sit') { legL = legR = 1.45; torsoX = 0.1; }
  else if (habit === 'yawn') { armLx = 2.8; armLz = 0.2; headX = 0.35; torsoX = 0.08; }
  else if (habit === 'cup') { armLx = 1.75 + 0.15 * Math.sin(t * 0.9); armLz = 0.55; headX = 0.05; }
  else if (habit === 'phone') { armLx = 2.25; armLz = 0.75; headZ = 0.18; }
  if (!pose && !habit && walk < 0.05) { headX = 0.04 * Math.sin(t * 1.3); }   // breathing
  ease(B.legL, legL, 0, 0, k); ease(B.legR, legR, 0, 0, k);
  ease(B.armL, armLx, 0, armLz, k);
  ease(B.armR, pose === 'flip' ? 0.6 : f.who === 'zhora' ? -sw * 0.3 : 0.03 * Math.sin(t * 2), 0, 0, k);   // the lantern hangs and sways
  // the torso turns with the gaze at once (the flashlight's beam turns with patrol.upper)
  B.torso.rotation.y = p.upper.rotation.y;
  B.torso.rotation.x = lerp(B.torso.rotation.x, torsoX, k);
  ease(B.head, headX, 0, headZ, k);
  // breathing: the chest rises a little
  B.torso.scale.y = 1 + 0.012 * Math.sin(t * 1.6);
  // Pozikhailo: fed = on the shoulder (stretches when the guard yawns); hungry (angry) = gone
  const angry = !!(p.brain && (p.brain.angryT > 0 || p.brain.agitated));
  const want = angry || pose ? 0 : habit === 'yawn' ? 1.25 : 1;
  f.poz = lerp(f.poz ?? 1, want, 1 - Math.exp(-dt / 0.35));
  B.poz.scale.set(f.poz, f.poz * (habit === 'yawn' ? 1.2 : 1), f.poz);
  B.poz.position.y = f.rest.poz.y - (1 - f.poz) * 0.25;
  // the bucket (systems/traps.js puts it at the old head's height) on this head
  if (p.bucketMesh) p.bucketMesh.position.y = f.headY - 1.66;
}

// a friend (net/remotePlayer.js): steps from its speed, crouching (hips down, knees forward), the head
// nods with the gaze, arms forward while carrying something
export function animateThief(rp, dt) {
  const f = rp.fig, B = f.bones, k = 1 - Math.exp(-dt / 0.12);
  const v = rp.lost ? 0 : rp.speed, walk = clamp(v / 1.2, 0, 1.5);
  f.phase = (f.phase || 0) + v * dt * 5.2;
  const sw = Math.sin(f.phase) * 0.5 * walk, crouch = rp.crouched;
  const carry = !!rp.desk;
  ease(B.legL, crouch ? 0.9 + sw * 0.4 : sw, 0, 0, k);
  ease(B.legR, crouch ? 0.9 - sw * 0.4 : -sw, 0, 0, k);
  const P0 = f.pivots, still = walk < 0.05 && !carry;
  // Nazar keeps his notebook to his chest; Zoya, standing still, puts a finger to her lips: «Тссс»
  ease(B.armL, carry ? 1.3 : P0.book ? 0.9 : crouch ? 0.4 : -sw * 0.8, 0, carry ? 0.15 : P0.book ? 0.55 : 0.06, k);
  ease(B.armR, carry ? 1.3 : P0.shush && still ? 2.55 : crouch ? 0.4 : sw * 0.8, 0, carry ? -0.15 : P0.shush && still ? -0.45 : -0.06, k);
  B.hips.position.y = lerp(B.hips.position.y, f.rest.hips.y - (crouch ? f.rest.hips.y * 0.38 : 0) + Math.abs(Math.sin(f.phase)) * 0.025 * walk, k);
  B.torso.rotation.x = lerp(B.torso.rotation.x, crouch ? -0.45 : walk > 1.1 ? -0.2 : 0, k);
  B.head.rotation.x = clamp(rp.lookPitch || 0, -0.6, 0.6) - B.torso.rotation.x * 0.6;
}
