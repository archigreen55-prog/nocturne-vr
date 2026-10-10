// «Грати з друзями» on the start screen (plan-multiplayer §1.1): create a room or join one by its code;
// in a room: the code, a QR of the invitation link, «Надіслати посилання», who is here, what is going on.
// Pure DOM; the network is src/systems/net.js (it calls lobby.show(state) whenever something changes).
import { S } from '../i18n/index.js';
import { bindPress } from './press.js';
import { prettyCode, cleanCode } from '../net/room.js';

const THIEVES = ['zoya', 'frol', 'rita', 'nazar'];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Lobby {
  // root: the element to fill; on: { create(name, thief), join(code, name, thief), leave(), share(), solo() }
  constructor(root, on, { name = '', thief = 'zoya', code = '' } = {}) {
    this.root = root; this.on = on;
    root.innerHTML = `
      <h2>${esc(S.net.title)}</h2>
      <p class="muted" id="netintro">${esc(S.net.intro)}</p>
      <div class="row" id="netwho">
        <label>${esc(S.net.name)} <input id="netname" maxlength="12" autocomplete="nickname" size="10"></label>
        <label>${esc(S.net.thief)} <select id="netthief">${THIEVES.map((t) => `<option value="${t}">${esc(S.crew.names[t])}</option>`).join('')}</select></label>
      </div>
      <div class="row" id="netout">
        <button id="netcreate">${esc(S.net.create)}</button>
        <input id="netcode" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" size="8" placeholder="${esc(S.net.codePlaceholder)}" aria-label="${esc(S.net.codeLabel)}">
        <button id="netjoin">${esc(S.net.join)}</button>
      </div>
      <p id="netcard" class="muted" hidden></p>
      <div id="netin" hidden>
        <div class="row"><b id="netroom" style="font-size:24px;letter-spacing:2px"></b><canvas id="netqr" width="132" height="132" style="background:#fff;border-radius:6px"></canvas></div>
        <div class="row"><button id="netshare">${esc(S.net.share)}</button><button id="netleave">${esc(S.net.leave)}</button></div>
        <p class="muted" id="netlink" style="word-break:break-all"></p>
        <p><b>${esc(S.net.who)}</b></p>
        <ul id="netlist" style="margin:4px 0 8px;padding-left:20px"></ul>
        <div class="row"><span id="netguardis" class="muted"></span><button id="netguard">${esc(S.hguard.becomeGuard)}</button></div>
        <p class="muted">${esc(S.net.playHint)}</p>
      </div>
      <p id="netstatus" style="color:var(--warn)"></p>
      <div class="row" id="netsolo" hidden><button id="netsolobtn">${esc(S.net.soloAfterLost)}</button></div>`;
    const q = (id) => root.querySelector('#' + id);
    this.el = { name: q('netname'), thief: q('netthief'), code: q('netcode'), out: q('netout'), inn: q('netin'), card: q('netcard'), room: q('netroom'), qr: q('netqr'), link: q('netlink'), list: q('netlist'), guard: q('netguard'), guardIs: q('netguardis'), status: q('netstatus'), solo: q('netsolo') };
    this.el.name.value = name; this.el.thief.value = THIEVES.includes(thief) ? thief : 'zoya';
    if (code) this.el.code.value = prettyCode(code);
    if (!this.el.name.value) this.el.name.value = S.crew.names[this.el.thief.value];
    this.el.thief.addEventListener('change', () => { if (THIEVES.some((t) => S.crew.names[t] === this.el.name.value)) this.el.name.value = S.crew.names[this.el.thief.value]; });
    const who = () => [this.el.name.value.trim().slice(0, 12) || S.crew.names[this.el.thief.value], this.el.thief.value];
    bindPress(q('netcreate'), () => on.create(...who()));
    bindPress(q('netjoin'), () => on.join(cleanCode(this.el.code.value), ...who()));
    bindPress(q('netshare'), () => on.share());
    bindPress(q('netleave'), () => on.leave());
    bindPress(q('netsolobtn'), () => on.solo());
    bindPress(q('netguard'), () => on.role && on.role(this.el.guard.dataset.want === '1'));   // W15: play the guard
    this.el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') on.join(cleanCode(this.el.code.value), ...who()); });
  }

  // st: { inRoom, code, link, players: [{ pid, name, thief, host, you, lost, mic, guard }], guardPid, myPid, status, statusBad, card, lost }
  show(st) {
    const e = this.el;
    e.out.hidden = !!st.inRoom; e.inn.hidden = !st.inRoom;
    e.name.disabled = e.thief.disabled = !!st.inRoom;
    e.card.hidden = !st.card; e.card.textContent = st.card || '';
    e.status.textContent = st.status || '';
    e.status.style.color = st.statusBad ? 'var(--bad)' : 'var(--warn)';
    e.solo.hidden = !st.lost;
    if (st.inRoom) {
      if (e.room.textContent !== S.net.room(prettyCode(st.code))) { e.room.textContent = S.net.room(prettyCode(st.code)); this.drawQr(st.link); }
      e.link.textContent = st.link;
      e.list.innerHTML = (st.players || []).map((p) => `<li>${esc(p.name)} · ${esc(S.crew.names[p.thief] || p.thief)}${p.host ? ` · ${esc(S.net.host)}` : ''}${p.you ? ` · ${esc(S.net.you)}` : ''}${p.lost ? ` · ${esc(S.net.lostTag)}` : ''}${p.mic === false ? ` · ${esc(S.net.noMic)}` : ''}${p.guard ? ` · ${esc(S.hguard.tag)}` : ''}</li>`).join('');
      // W15: who plays the guard, and the button to take the role or give it back
      const g = (st.players || []).find((p) => p.guard), mine = !!st.guardPid && st.guardPid === st.myPid;
      e.guardIs.textContent = g ? S.hguard.guardIs(g.name) : S.hguard.guardAi;
      e.guard.textContent = mine ? S.hguard.becomeThief : S.hguard.becomeGuard;
      e.guard.dataset.want = mine ? '0' : '1';
      e.guard.disabled = !mine && !!g;
    }
  }

  // the QR of the link (vendor/qrcode-*.min.js, loaded on the first room); no network for the picture
  async drawQr(link) {
    const c = this.el.qr, g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    try {
      const { default: qrcode } = await import('qrcode-generator');
      const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
      const n = qr.getModuleCount(), cell = Math.floor((c.width - 8) / n), off = Math.floor((c.width - cell * n) / 2);
      g.fillStyle = '#000';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) g.fillRect(off + x * cell, off + y * cell, cell, cell);
      c.dataset.ok = '1';
    } catch { c.dataset.ok = '0'; }
  }
}
