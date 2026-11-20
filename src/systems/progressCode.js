// The start screen's «Прогрес: код» (export / import of progress, src/game/progress.js) and
// «Навчання ще раз» (systems/tutorial.js). The pause menu's settings page opens the same block.
// Plan 2026-11-19 «fixes after test 1», task 3: the main menu's card «Мій прогрес» (what is saved on this
// device, «Перенести на інший пристрій» = the code, on a phone through the share sheet; «Вставити код»), the
// summary's line «Прогрес збережено на цьому телефоні» (once with a hint to keep the code), and the browser asked
// to keep the game's storage (navigator.storage.persist).
import { exportProgress, readCode, importProgress } from '../game/progress.js';
import { bindPress } from '../ui/press.js';
import { S } from '../i18n/index.js';
import { G, $ } from './state.js';
import { restartTutorial } from './tutorial.js';
import { loadSetting, saveSetting, storageWorks } from '../settings.js';
import { wallet } from '../game/economy.js';
import { levels, stars as levelStars, currentLevel } from '../game/campaign.js';
import { money } from '../ui/board.js';
import { goPage } from './menu.js';

const HINT_STARS = 5;   // the summary's hint to keep the code: once, from this many stars on

let pending = null;   // a read code waiting for the second press of «Замінити…»

function note(text, color = '') { $('prognote').textContent = text; $('prognote').style.color = color; }
export function openProgress() {
  $('progress').hidden = false;
  setTimeout(() => $('progress').scrollIntoView({ block: 'start' }), 50);
}

const place = () => S.progress2.place[(G.MODE && G.MODE.mode) || 'pc'] || S.progress2.place.pc;
const starsNow = () => levels().reduce((a, l) => a + levelStars(l), 0);

// the main menu's line: ★ stars · $ · the level you are on — on this device
export function renderProgressCard() {
  const line = $('mmprogline');
  if (!line) return;
  const l = currentLevel();
  line.textContent = storageWorks() ? S.progress2.line(starsNow(), money(wallet().cash), l ? l.n : null, place()) : S.progress2.notSaved;
}

// The summary's line: { text, warn } — saved here, or the browser keeps nothing. The hint to keep the code comes
// once (from HINT_STARS stars on) and stays on that round's summary.
let hintFor = null;
export function savedNote() {
  if (!storageWorks()) return { text: S.progress2.notSaved, warn: true };
  const R = G.round && G.round.result;
  if (R && hintFor !== R && !loadSetting('codeHinted', false) && starsNow() >= HINT_STARS) { hintFor = R; saveSetting('codeHinted', true); }
  return { text: S.progress2.saved(place()) + (R && hintFor === R ? ' ' + S.progress2.hint : ''), warn: false };
}

// export: the code is made and copied inside the tap (Safari copies only from a tap); share: a phone's share
// sheet (send it to yourself in a messenger), the copy if there is none or it is closed
function doExport(share) {
  const code = $('progcode'), apply = $('progapply');
  const { code: c, count } = exportProgress();
  pending = null; apply.hidden = true;
  code.hidden = false; code.readOnly = true; code.value = c;
  const copy = () => {
    code.focus(); code.select();
    const fail = () => note(S.progress.copyByHand, '#ffd166');
    try { navigator.clipboard.writeText(c).then(() => note(S.progress.copied(count), '#5fd38d'), fail); } catch { fail(); }
  };
  if (share && navigator.share && G.MODE && G.MODE.mode === 'phone') {
    try { navigator.share({ text: c }).then(() => note(S.progress2.shared, '#5fd38d'), copy); return; } catch { /* no share sheet */ }
  }
  copy();
}
function doImport() {
  const code = $('progcode'), apply = $('progapply');
  pending = null;
  code.hidden = false; code.readOnly = false; code.value = '';
  apply.hidden = false; apply.textContent = S.progress.apply;
  note(S.progress.paste);
  code.focus();
}
// the menu card's buttons: the «Ще» page with the code's block open
function openOnMore() { goPage('more'); $('progress').hidden = false; note(''); setTimeout(() => $('progress').scrollIntoView({ block: 'start' }), 50); }

// ask the browser to keep the game's storage (Chrome / Android, an installed app; Safari keeps its own rules).
// Not in Firefox: it asks the player with a dialog.
function askPersist() {
  try {
    if (/Firefox\//.test(navigator.userAgent) || !navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted().then((p) => (p ? p : navigator.storage.persist())).catch(() => {});
  } catch { /* old browsers */ }
}

export const progressCode = {
  id: 'progressCode',
  init() {
    const box = $('progress'), code = $('progcode'), apply = $('progapply');
    bindPress($('progbtn'), () => { box.hidden = !box.hidden; note(''); });
    bindPress($('progexport'), () => doExport(false));
    bindPress($('progimport'), doImport);
    if ($('mmprogsend')) {
      bindPress($('mmprogsend'), () => { openOnMore(); doExport(true); });
      bindPress($('mmprogpaste'), () => { openOnMore(); doImport(); });
    }
    askPersist();
    renderProgressCard();
    code.addEventListener('input', () => { if (!code.readOnly) { pending = null; apply.textContent = S.progress.apply; } });
    // import: a check first, then a second press to replace this device's progress
    bindPress(apply, () => {
      if (pending) {
        if (importProgress(pending.data)) { note(S.progress.done, '#5fd38d'); setTimeout(() => location.reload(), 400); }
        else note(S.progress.storageBlocked, '#ff9f43');
        pending = null;
        return;
      }
      const r = readCode(code.value);
      if (!r.ok) { note(S.progress.bad[r.why], '#ff9f43'); return; }
      pending = r;
      apply.textContent = S.progress.confirm;
      note(S.progress.ready(r.count), '#ffd166');
    });
    // the tutorial: not in VR mode (the headset has its own wrist and board)
    if (G.MODE.mode === 'vr') $('tutorialbtn').hidden = true;
    bindPress($('tutorialbtn'), () => { restartTutorial(); note(''); $('tutorialbtn').textContent = S.tutorial.againQueued; });
  },
};
