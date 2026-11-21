// «Засоби бригади» (the menu's guide to the helpers): a card for every helper the player has reached — what it
// does, where, how (the line for this device), a tip; the numbers and prices from the configs; the cards of
// mechanics not reached yet are locks with their level; no traps, no cart, no blanket; the shop's rows have a
// «?» that opens the page on that card, the shop page and «Ще» link to it. These pages run the campaign.
import assert from 'node:assert/strict';
import { newContext } from './harness.mjs';
import { browser, open, test, base, LAND, UA, preview } from './runner.mjs';

const S1 = { medium: 1 };
const IDS = ['thermos', 'gloves', 'mask', 'sneakers', 'boots', 'can', 'bottle', 'radio', 'phone', 'breaker'];

// the campaign (a fresh player or seeded stars / wallet), the page ?page=crew
async function crew({ ctxOpts = {}, stars = null, wallet = null, url = base + '?page=crew' } = {}) {
  const ctx = await newContext(browser, ctxOpts, { menu: true });
  await ctx.addInitScript(([stars, wallet]) => {
    window.__NOCTURNE_TEST = { pages: 'all', splash: false, campaign: true };
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      if (stars) localStorage.setItem('nocturne.stars', JSON.stringify(stars));
      if (wallet) localStorage.setItem('nocturne.wallet2', JSON.stringify(wallet));
    }
  }, [stars, wallet]);
  const { page, errors } = await open(ctx, url);
  return { ctx, page, errors };
}
const cardsOf = (page) => page.evaluate(() => [...document.querySelectorAll('#crewlist [data-crew]')].map((c) => ({
  id: c.dataset.crew, locked: c.classList.contains('locked'), owned: c.classList.contains('owned'), name: c.querySelector('b').textContent,
  rows: [...c.querySelectorAll('span')].map((s) => s.className + '|' + s.textContent),
})));

test('crew guide: ?page=crew shows the five buy cards and the two locked groups (throw from level 3, devices from level 8); each open card has what / where / how / tip and a footer with the shop\'s price; the numbers are the configs\'; no traps, cart or blanket', async () => {
  const { ctx, page, errors } = await crew({ ctxOpts: LAND });
  const cards = await cardsOf(page);
  assert.deepEqual(cards.map((c) => c.id), IDS, 'the cards, in order');
  const r = await page.evaluate(async () => {
    const g = window.__game, E = await import('./src/game/economy.js'), B = await import('./src/ui/board.js'), P = await import('./src/config/player.js');
    const price = Object.fromEntries(['thermos', 'gloves', 'mask', 'sneakers', 'boots'].map((id) => [id, B.money(E.upgrade(id).price)]));
    return { price, tea: E.upgrade('thermos').teaExtra, run: E.upgrade('sneakers').stamina, quiet: E.upgrade('boots').quietSpeed, base: P.player.quietSpeed, throwLevel: g.CFG.campaign.mechanics.throw, devLevel: g.CFG.campaign.mechanics.devices,
      shown: [...document.querySelectorAll('#overlay section[data-page]')].filter((s) => !s.hidden).map((s) => s.dataset.page), groups: [...document.querySelectorAll('#crewlist h3')].map((h) => h.textContent),
      text: document.getElementById('crewlist').textContent, traps: g.CFG.traps.order };
  });
  assert.deepEqual(r.shown, ['crew']);
  assert.deepEqual(r.groups, ['Купити в магазині', 'Кидати', 'Пристрої в домі']);
  for (const c of cards.slice(0, 5)) {
    assert.ok(!c.locked, `${c.id} is open from the start`);
    assert.deepEqual(c.rows.map((x) => x.split('|')[0]), ['crew-does', 'crew-where', 'crew-how', 'crew-tip', 'crew-foot'], `${c.id}: four lines and the footer`);
    assert.ok(c.rows.slice(0, 4).every((x) => x.split('|')[1].length > 12), `${c.id}: no empty line`);
    assert.equal(c.rows[4].split('|')[1], `${r.price[c.id]} · Магазин · не куплено`, `${c.id}: the price is the shop's`);
  }
  const text = (id, k) => cards.find((c) => c.id === id).rows.find((x) => x.startsWith('crew-' + k)).split('|')[1];
  assert.match(text('thermos', 'does'), new RegExp(`на ${r.tea} с довше`), 'the thermos: the config\'s seconds');
  assert.match(text('sneakers', 'does'), new RegExp(`на ${r.run} с довше`), 'the sneakers: the config\'s seconds');
  const pct = Math.round((r.quiet / r.base - 1) * 100);
  assert.match(text('boots', 'does'), new RegExp(`на ${pct} % швидше`), 'the boots: the percent from the config\'s speeds');
  assert.match(text('sneakers', 'how'), /палець за пунктирне коло/, 'the phone: its own way to run');
  // the locks: a level each, no words about the card
  for (const [id, lv] of [['can', r.throwLevel], ['bottle', r.throwLevel], ['radio', r.devLevel], ['phone', r.devLevel], ['breaker', r.devLevel]]) {
    const c = cards.find((x) => x.id === id);
    assert.ok(c.locked, `${id}: a lock for a player who has not got there`);
    assert.equal(c.name, '???');
    assert.deepEqual(c.rows.map((x) => x.split('|')[1]), [`Відкриється на рівні ${lv}.`]);
  }
  assert.deepEqual([r.throwLevel, r.devLevel], [3, 8], 'the levels the campaign brings them on');
  // not in the guide: the traps, the cart, the blanket
  for (const w of ['Мило', 'Кульки', 'Відро', 'Мотузка', 'Будильник', 'Тачка', 'Ковдра']) assert.ok(!r.text.includes(w), `no «${w}»`);
  assert.deepEqual(await page.$$eval('#crewlist [data-crew]', (c) => c.filter((x) => /soap|marbles|bucket|rope|clock|cart|blanket/.test(x.dataset.crew)).length), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('crew guide: the line «Як» is the device\'s — a phone, a PC, a VR browser each read their own (throw, radio, phone, sneakers, boots)', async () => {
  const lines = {};
  for (const [mode, opts] of [['phone', LAND], ['pc', {}], ['vr', { ...LAND, userAgent: UA.quest }]]) {
    const { ctx, page, errors } = await crew({ ctxOpts: opts, stars: { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1, clock: S1, m8: S1, m10: S1 } });
    const got = await page.evaluate(async () => {
      const C = await import('./src/systems/crewGuide.js');
      return { mode: window.__game.MODE.mode, cards: C.crewCards().map((c) => [c.id, c.locked, c.how]) };
    });
    assert.equal(got.mode, mode);
    assert.ok(got.cards.every(([, locked]) => !locked), `${mode}: all open for a player who reached level 8`);
    lines[mode] = Object.fromEntries(got.cards.map(([id, , how]) => [id, how]));
    // the page itself shows that line
    const shown = await page.$eval('[data-crew="can"] .crew-how', (e) => e.textContent);
    assert.equal(shown, 'Як: ' + lines[mode].can);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  assert.match(lines.phone.can, /«Покласти»/); assert.match(lines.pc.can, /ЛКМ/); assert.match(lines.vr.can, /Замахнись/);
  assert.match(lines.phone.radio, /кнопка «Радіо»/); assert.match(lines.pc.radio, /клавіша E/); assert.match(lines.vr.radio, /тригер/);
  assert.match(lines.phone.phone, /«Подзвонити»/); assert.match(lines.pc.phone, /клавіша E/); assert.match(lines.vr.phone, /тригер/);
  assert.match(lines.phone.breaker, /«Щиток»/);
  assert.match(lines.phone.sneakers, /пунктирне коло/); assert.match(lines.pc.sneakers, /пробіл двічі/); assert.match(lines.vr.sneakers, /стіка/);
  assert.match(lines.phone.boots, /унктирне коло/); assert.ok(!/унктирне/.test(lines.pc.boots) && !/унктирне/.test(lines.vr.boots), 'the dotted circle is the phone\'s only');
  assert.match(lines.pc.can, /ПКМ/);
  assert.ok(lines.phone.bottle === lines.pc.bottle && lines.pc.bottle === lines.vr.bottle, 'the bottle: one line for all');
});

test('crew guide: levels open the locks (3 → the cans and the bottles; 8 → the devices); a bought upgrade is «Є ✓»; the page fits the smallest phone (667×280)', async () => {
  const small = { ...LAND, viewport: { width: 667, height: 280 } };
  // level 3 «Бляшанка» open (stars on 0–2), level 8 not yet; the thermos bought
  let { ctx, page, errors } = await crew({ ctxOpts: small, stars: { rehearsal: S1, first: S1, chest: S1 }, wallet: { cash: 0, earned: 0, spent: 0, owned: ['thermos'], paid: {}, log: [], stock: {}, best: {} } });
  let cards = await cardsOf(page);
  const by = (id) => cards.find((c) => c.id === id);
  assert.ok(!by('can').locked && !by('bottle').locked, 'level 3 is open: the cans and the bottles');
  assert.ok(by('radio').locked && by('phone').locked && by('breaker').locked, 'level 8 is not: the devices stay locks');
  assert.deepEqual(by('radio').rows.map((x) => x.split('|')[1]), ['Відкриється на рівні 8.']);
  assert.ok(by('thermos').owned && /Є ✓$/.test(by('thermos').rows.at(-1)), 'the thermos: «Є ✓»');
  assert.ok(!by('gloves').owned && /не куплено$/.test(by('gloves').rows.at(-1)));
  assert.match(by('can').rows.at(-1), /Лежить у домі · з рівня 3$/);
  // nothing sticks out sideways on a 667-px phone; the page scrolls down
  const fit = await page.evaluate(() => {
    const w = innerWidth, over = [...document.querySelectorAll('#crewlist .lcard, #crewlist h3, #crewlist .cards')].filter((e) => e.getBoundingClientRect().right > w + 1 || e.getBoundingClientRect().left < -1).length;
    return { over, doc: document.documentElement.scrollWidth <= w + 1 };
  });
  assert.deepEqual(fit, { over: 0, doc: true });
  assert.deepEqual(errors, []);
  await ctx.close();
  // level 8 «Кабінет» open (the mansion after the clock, then the stars on m8 and m10)
  ({ ctx, page, errors } = await crew({ ctxOpts: small, stars: { rehearsal: S1, first: S1, chest: S1, quiet: S1, wardrobe: S1, clock: S1, m8: S1, m10: S1 } }));
  cards = await cardsOf(page);
  assert.ok(cards.every((c) => !c.locked), 'every card is open on level 8');
  assert.match(cards.find((c) => c.id === 'radio').rows.at(-1), /Стоїть у домі · з рівня 8$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('crew guide: the shop page links to it, every upgrade row has a «?» after its buy button that opens the page on that card, «←» goes back; «Ще» has the page too', async () => {
  const ctx = await newContext(browser, LAND, { menu: true });
  const { page, errors } = await open(ctx, preview + '?nosplash=1');
  await page.waitForFunction(() => window.__splashDone || !document.getElementById('splash'), null, { timeout: 30000 });
  if (await page.$('#micask:not([hidden])')) await page.click('#asklater');
  const shown = () => page.evaluate(() => [...document.querySelectorAll('#overlay section[data-page]')].filter((s) => !s.hidden && getComputedStyle(s).display !== 'none').map((s) => s.dataset.page));
  await page.click('#mmnav [data-go="shop"]');
  assert.deepEqual(await shown(), ['shop']);
  assert.deepEqual(await page.$$eval('#shoplist [data-shop]', (r) => r.map((x) => [x.dataset.shop, !!x.querySelector('.shq'), x.querySelector('button').textContent !== '?'])),
    ['gloves', 'thermos', 'mask', 'sneakers', 'boots'].map((id) => [id, true, true]), 'five rows, each with «?», the first button of a row stays the buy one');
  // «?» on the gloves → the page, that card lit, and the browser's back is the shop
  await page.click('#shoplist [data-shop="gloves"] .shq');
  assert.deepEqual(await shown(), ['crew']);
  assert.match(page.url(), /page=crew/);
  assert.deepEqual(await page.$$eval('#crewlist .focus', (c) => c.map((x) => x.dataset.crew)), ['gloves']);
  assert.ok(await page.$eval('#crewlist [data-crew="gloves"]', (c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 2; }), 'the card is scrolled into view');
  await page.click('section[data-page="crew"] [data-back]');
  await page.waitForFunction(() => !location.search.includes('page=crew'));
  assert.deepEqual(await shown(), ['shop'], '«←» comes back to the shop');
  // the link on the shop page: the page from the top, nothing lit
  await page.click('#overlay .crewlink');
  assert.deepEqual(await shown(), ['crew']);
  assert.equal(await page.$$eval('#crewlist .focus', (c) => c.length), 0);
  assert.ok(await page.$eval('#crewlist .lcard', (c) => c.textContent.length > 0), 'drawn again each time');
  // «Налаштування» → «Ще» → «Засоби бригади»
  await page.goto(preview + '?nosplash=1');
  await page.waitForFunction(() => window.__game && window.__splashDone, null, { timeout: 90000 });
  if (await page.$('#micask:not([hidden])')) await page.click('#asklater');
  await page.click('#mmnav [data-go="settings"]');
  await page.click('section[data-page="settings"] [data-go="more"]');
  await page.click('section[data-page="more"] [data-go="crew"]');
  assert.deepEqual(await shown(), ['crew']);
  assert.equal(await page.$$eval('#mmnav [data-go]', (b) => b.length), 5, 'the main menu keeps its five buttons');
  assert.deepEqual(errors, []);
  await ctx.close();
});
