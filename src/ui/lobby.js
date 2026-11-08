// «Грати з друзями» on the start screen (plan-multiplayer §1.1): create a room or join one by its code;
// in a room: the code, a QR of the invitation link, «Надіслати посилання», who is here, what is going on.
// Pure DOM; the network is src/systems/net.js (it calls lobby.show(state) whenever something changes).
import { S } from '../i18n/index.js';
import { bindPress } from './press.js';
import { LevelPick } from './levelPick.js';   // menu design: the same level cards as «Грати»
import { prettyCode, cleanCode } from '../net/room.js';

const THIEVES = ['zoya', 'frol', 'rita', 'nazar'];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Lobby {
  // root: the element to fill; on: { create(name, thief), join(code, name, thief), leave(), share(), solo() }
  constructor(root, on, { name = '', thief = 'zoya', code = '' } = {}) {
    this.root = root; this.on = on;
    root.innerHTML = `
      <div id="netwho" class="nt-who">
        <label class="nt-name"><span>${esc(S.net.name)}</span><input id="netname" maxlength="12" autocomplete="nickname" size="10"></label>
        <label class="nt-thief"><span>${esc(S.net.thief)}</span><select id="netthief" class="seg-src">${THIEVES.map((t) => `<option value="${t}">${esc(S.crew.names[t])}</option>`).join('')}</select></label>
      </div>
      <div id="netout" class="nt-out">
        <button id="netcreate" class="nt-big primary">${esc(S.net.create)}</button>
        <div class="nt-join">
          <input id="netcode" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" size="8" placeholder="${esc(S.net.codePlaceholder)}" aria-label="${esc(S.net.codeLabel)}">
          <button id="netjoin" class="nt-big">${esc(S.net.join)}</button>
        </div>
      </div>
      <p id="netcard" class="nt-card" hidden></p>
      <div id="netin" class="nt-room" hidden>
        <div class="nt-left">
          <div class="nt-code"><b id="netroom"></b><canvas id="netqr" width="132" height="132"></canvas></div>
          <button id="netstart" class="primary nt-start" type="button">${esc(S.net.start)}</button>
          <p id="netwait" class="nt-wait">${esc(S.net.waitStart)}</p>
          <div class="nt-acts"><button id="netshare" class="nt-small">${esc(S.net.share)}</button><button id="netleave" class="nt-small">${esc(S.net.leave)}</button></div>
          <p class="muted" id="netlink"></p>
          <p class="nt-h">${esc(S.net.who)}</p>
          <ul id="netlist" class="nt-list"></ul>
          <div class="nt-guard"><span id="netguardis" class="muted"></span><button id="netguard" class="nt-small">${esc(S.hguard.becomeGuard)}</button></div>
        </div>
        <div id="netsetup" class="nt-right">
          <p class="nt-h">${esc(S.net.mission)}</p>
          <p id="netgoal" class="nt-goal"></p>
          <div id="netpick"><div id="netlevels"></div><div class="seg" id="netdiffs"></div></div>
          <p id="netchoice" class="nt-choice"></p>
          <div class="nt-acts"><button id="nethouse" type="button" class="nt-small"></button></div>
        </div>
      </div>
      <p id="netstatus" style="color:var(--warn)"></p>
      <p class="muted" id="netver" style="font-size:12px;margin:2px 0"></p>
      <div class="row" id="netsolo" hidden><button id="netsolobtn">${esc(S.net.soloAfterLost)}</button></div>`;
    const q = (id) => root.querySelector('#' + id);
    this.el = { name: q('netname'), thief: q('netthief'), code: q('netcode'), out: q('netout'), inn: q('netin'), card: q('netcard'), room: q('netroom'), qr: q('netqr'), link: q('netlink'), list: q('netlist'), guard: q('netguard'), guardIs: q('netguardis'), status: q('netstatus'), solo: q('netsolo'), ver: q('netver') };
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
    bindPress(q('netstart'), () => { if (!q('netstart').disabled && on.start) on.start(); });   // T4b
    bindPress(q('nethouse'), () => { if (!q('nethouse').disabled && on.house) on.house(); });
    bindPress(q('netguard'), () => on.role && on.role(this.el.guard.dataset.want === '1'));   // W15: play the guard
    this.built = '';   // T4a: the room's buttons are made once (show() runs twice a second: a remade button loses the finger)
    this.el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') on.join(cleanCode(this.el.code.value), ...who()); });
  }

  // st: { inRoom, code, link, players: [{ pid, name, thief, host, you, lost, mic, guard }], guardPid, myPid, status, statusBad, card, lost }
  show(st) {
    const e = this.el;
    e.out.hidden = !!st.inRoom; e.inn.hidden = !st.inRoom;
    this.root.classList.toggle('in-room', !!st.inRoom);   // menu design: the thief and the name are picked before; the room is the room
    e.name.disabled = e.thief.disabled = !!st.inRoom;
    e.card.hidden = !st.card; e.card.textContent = st.card || '';
    e.status.textContent = st.status || '';
    e.status.style.color = st.statusBad ? 'var(--bad)' : 'var(--warn)';
    e.solo.hidden = !st.lost;
    e.ver.textContent = st.version ? S.net.versionLine(st.version) : '';   // T3: friends compare their builds
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
      this.showSetup(st);
    }
  }

  // T4a: the host picks the mission (the levels of this house, 🔒 closed) and the difficulty in the room;
  // a guest sees the host's choice as text. st.levels: [{ id, label, locked, current }], st.diffs: [{ id, name, current }]
  showSetup(st) {
    const q = (id) => this.root.querySelector('#' + id);
    const host = st.role === 'host', pick = q('netpick'), choice = q('netchoice');
    const start = q('netstart'), house = q('nethouse');
    start.hidden = house.hidden = !host; q('netwait').hidden = host;
    start.disabled = !st.canStart;
    if (st.house) { house.textContent = S.net.otherHouse(st.house.name); house.disabled = !st.house.open; }
    choice.textContent = host ? '' : st.choice || '';   // the host sees its choice on the cards
    q('netgoal').textContent = st.goal || '';   // the goal of the chosen level, for the host and the guests
    if (!this.pick) this.pick = new LevelPick(q('netlevels'), (id) => this.on.pickLevel && this.on.pickLevel(id));
    this.pick.show(st.levels || [], !host);   // a guest sees the same cards, none pressable
    const sig = JSON.stringify((st.diffs || []).map((d) => d.id));
    if (sig !== this.built) {
      this.built = sig;
      const df = q('netdiffs');
      df.replaceChildren();
      for (const d of st.diffs || []) { const b = document.createElement('button'); b.type = 'button'; b.dataset.id = d.id; b.textContent = d.name; bindPress(b, () => { if (!b.disabled && this.on.pickDiff) this.on.pickDiff(d.id); }); df.append(b); }
    }
    for (const b of q('netdiffs').children) {
      const d = (st.diffs || []).find((x) => x.id === b.dataset.id) || {};
      b.disabled = !host;
      b.classList.toggle('on', !!d.current); b.setAttribute('aria-pressed', d.current ? 'true' : 'false');
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
