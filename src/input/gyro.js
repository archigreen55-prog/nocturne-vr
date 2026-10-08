// Gyroscope look (plan-phone-mode §1.2, decision §9 p. 3: an option, the finger stays the main way).
// Turning the phone turns the view, on top of the finger. Uses the rotation rate (devicemotion), so
// there is no drift from absolute angles and no permission beyond the motion one. In landscape the
// device's x axis (its short edge) is vertical: turning around it is the yaw; its y axis (the long
// edge) is horizontal: turning around it is the pitch. Signs follow the landscape side
// (screen.orientation.angle 90 or 270). iPhone asks for the motion permission, only from a tap.
const DEG = Math.PI / 180;

export class Gyro {
  constructor() {
    this.on = false;
    this.state = 'off';      // off | on | denied | none (no sensor events)
    this.look = { x: 0, y: 0 };   // rad since the last read: x = turn right, y = look down
    this.events = 0;
    this.lastT = 0;
    this.onMotion = (e) => this.motion(e);
  }

  // Call from a tap. Resolves true when it is on.
  async enable() {
    if (typeof window.DeviceMotionEvent === 'undefined') { this.state = 'none'; return false; }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try { if (await DeviceMotionEvent.requestPermission() !== 'granted') { this.state = 'denied'; return false; } }
      catch { this.state = 'denied'; return false; }
    }
    addEventListener('devicemotion', this.onMotion);
    this.on = true; this.state = 'on'; this.lastT = 0;
    // no events within 1.5 s: there is no gyroscope (or the browser blocks it)
    const n0 = this.events;
    setTimeout(() => { if (this.on && this.events === n0) this.state = 'none'; }, 1500);
    return true;
  }

  disable() {
    removeEventListener('devicemotion', this.onMotion);
    this.on = false; this.state = 'off'; this.look.x = this.look.y = 0;
  }

  motion(e) {
    const r = e.rotationRate;
    if (!this.on || !r || r.beta == null || r.gamma == null) return;
    this.events++;
    if (this.state !== 'on') this.state = 'on';
    const t = e.timeStamp;
    const dt = this.lastT ? Math.min(0.1, Math.max(0, (t - this.lastT) / 1000)) : 0;
    this.lastT = t;
    const angle = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : (window.orientation || 0);
    const s = angle === 270 || angle === -90 ? 1 : angle === 90 ? -1 : 0;
    if (!s) return;   // portrait: the game waits behind "rotate the phone" anyway
    this.look.x += s * r.beta * DEG * dt;    // turn right
    this.look.y -= s * r.gamma * DEG * dt;   // look up = negative y
  }

  take(out) { out.x += this.look.x; out.y += this.look.y; this.look.x = this.look.y = 0; return out; }
}
