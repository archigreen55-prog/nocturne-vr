// The start screen's «Прогрес: код» (export / import of progress, src/game/progress.js) and
// «Навчання ще раз» (systems/tutorial.js). The pause menu's settings page opens the same block.
import { exportProgress, readCode, importProgress } from '../game/progress.js';
import { bindPress } from '../ui/press.js';
import { S } from '../i18n/index.js';
import { G, $ } from './state.js';
import { restartTutorial } from './tutorial.js';

let pending = null;   // a read code waiting for the second press of «Замінити…»

function note(text, color = '') { $('prognote').textContent = text; $('prognote').style.color = color; }
export function openProgress() {
  $('progress').hidden = false;
  setTimeout(() => $('progress').scrollIntoView({ block: 'start' }), 50);
}

export const progressCode = {
  id: 'progressCode',
  init() {
    const box = $('progress'), code = $('progcode'), apply = $('progapply');
    bindPress($('progbtn'), () => { box.hidden = !box.hidden; note(''); });
    // export: the code is made and copied inside this tap (Safari copies only from a tap)
    bindPress($('progexport'), () => {
      const { code: c, count } = exportProgress();
      pending = null; apply.hidden = true;
      code.hidden = false; code.readOnly = true; code.value = c;
      code.focus(); code.select();
      const fail = () => note(S.progress.copyByHand, '#ffd166');
      try {
        navigator.clipboard.writeText(c).then(() => note(S.progress.copied(count), '#5fd38d'), fail);
      } catch { fail(); }
    });
    bindPress($('progimport'), () => {
      pending = null;
      code.hidden = false; code.readOnly = false; code.value = '';
      apply.hidden = false; apply.textContent = S.progress.apply;
      note(S.progress.paste);
      code.focus();
    });
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
