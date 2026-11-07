// Home-screen app (plan-phone-mode §1.9, §10.1, wave T4): the service worker (sw.js, offline play and
// updates), the install button (Android Chrome) or the "Поділитися → На початковий екран" hint (iPhone
// Safari has no install prompt), and what the report says about it.
// The service worker never keeps an old version: pages come from the network first (the cache only
// when offline), and every module URL carries ?v=<version> (see sw.js). ?nosw removes it.
import { bindPress } from '../ui/press.js';
import { S } from '../i18n/index.js';

const state = { standalone: false, sw: 'none', swVersion: null, controlled: false, prompt: null, installed: false, errors: [] };
export const pwaState = () => ({ ...state });

export function setupPwa({ phone, ios, preview, onChange }) {
  const $ = (id) => document.getElementById(id);
  state.standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const params = new URLSearchParams(location.search);

  // ---- service worker ----
  if ('serviceWorker' in navigator) {
    if (params.has('nosw')) {
      // escape hatch: drop this scope's worker and its caches
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => { if (new URL(r.scope).pathname === new URL('./', location.href).pathname) r.unregister(); }));
      caches.keys().then((keys) => keys.filter((k) => k.startsWith(`nocturne:${new URL('./', location.href).pathname}:`)).forEach((k) => caches.delete(k)));
      state.sw = 'removed (?nosw)';
    } else {
      state.controlled = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then((reg) => {
        if (!reg) { state.sw = 'blocked'; return; }   // a browser setting (or the tests) blocks service workers
        state.sw = reg.active ? 'active' : 'installing';
        reg.update().catch(() => {});   // look for a new sw.js on every start, not once a day
        const track = (w) => w && w.addEventListener('statechange', () => { if (w.state === 'activated') { state.sw = 'active'; ask(); } });
        track(reg.installing || reg.waiting);
        reg.addEventListener('updatefound', () => track(reg.installing));
        ask();
      }, (e) => { state.sw = 'error'; state.errors.push(String(e && e.message || e)); });
      navigator.serviceWorker.addEventListener('controllerchange', () => { state.controlled = true; ask(); });
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.version) state.swVersion = e.data.version; });
    }
  }
  function ask() { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('version'); }

  // ---- install (phone only) ----
  if (!phone) return;
  const row = $('installrow'), btn = $('installbtn'), note = $('installnote');
  const show = (text, withButton = false) => { row.hidden = false; note.textContent = text; btn.hidden = !withButton; };
  const pv = preview ? S.pwa.preview : '';
  if (state.standalone) show(ios ? S.pwa.standaloneIos : S.pwa.standalone);
  else if (ios) show(S.pwa.iosHint + pv);
  else show(S.pwa.canInstall + pv);
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.prompt = e;
    show(S.pwa.install + pv, true);
    if (onChange) onChange();
  });
  addEventListener('appinstalled', () => { state.installed = true; show(S.pwa.installedHome); });
  bindPress(btn, async () => {
    if (!state.prompt) return;
    const p = state.prompt; state.prompt = null;
    p.prompt();
    try { const r = await p.userChoice; state.installed = r.outcome === 'accepted'; show(state.installed ? S.pwa.installed : S.pwa.later); }
    catch { /* dismissed */ }
  });
}
