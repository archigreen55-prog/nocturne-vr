// Economy v1: the wallet, the shop's upgrades, the bonus for new stars, which contracts and maps are
// open. Prices and effects are starting values, to be tuned after the players' reports (the report has
// the wallet and its log).

export const shop = {
  starBonus: 500,        // $ for every star not had before on that contract and difficulty
  logSize: 20,           // wallet log entries kept (rounds, stars, purchases) for the report
  // Upgrades: permanent, bought at the van (board) or in the phone's pause menu, only before the clock
  // starts. `soon`: listed, not sold yet (they need the heavy items).
  upgrades: [
    { id: 'thermos', price: 500, teaExtra: 20 },        // the guard's tea habit lasts this many s longer
    { id: 'gloves', price: 800, grabK: 2 },             // the crystal vase never slips; it can be grabbed this much faster
    { id: 'mask', price: 1000, scareK: 0.5 },           // the lurker's scare: this loud, no white flash
    { id: 'sneakers', price: 1200, stamina: 2 },        // + s of running
    { id: 'boots', price: 1500, quietSpeed: 1.4 },      // steps are silent up to this speed (m/s)
    { id: 'cart', price: 3000, soon: true },            // heavy items alone x0.7 (with the heavy items)
    { id: 'blanket', price: 1000, soon: true },         // heavy items fall quieter (with the heavy items)
  ],
  // Which contracts are open: the first of a map always (once the map is open); contract k+1 after
  // `chainStars` on contract k (any difficulty). Maps: by the stars on the earlier maps (the best of
  // each contract, any difficulty).
  unlock: { chainStars: 1, maps: { mansion: 8, museum: 20 } },
};
