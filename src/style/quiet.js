// three.js names every new object (material, geometry, texture, mesh) with Math.random — its uuid. The
// style's own objects take those numbers from crypto instead, so they never move the game's sequence
// of random numbers: with the style on or off the guard makes the same choices (tools/snapshot.mjs
// seeds Math.random and must see the same game).
const buf = new Uint32Array(64);
let i = buf.length;
function cryptoRandom() {
  if (i >= buf.length) { crypto.getRandomValues(buf); i = 0; }
  return buf[i++] / 4294967296;
}
export function quietRandom(fn) {
  const r = Math.random;
  Math.random = cryptoRandom;
  try { return fn(); } finally { Math.random = r; }
}
