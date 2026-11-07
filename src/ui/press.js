// Phone buttons made of HTML (pause menu, round summary): pressed like the board buttons since 0.6.0-pre.5.
// A finger that lands on a button presses it; the button fires when the finger is lifted over it
// (or within PRESS_SLOP px of where it landed), however long it was held. The finger never turns the
// camera (these layers sit above the touch layer). Pointer capture keeps the events coming when the
// finger rolls off the edge. A drag that leaves the button scrolls the list it sits in instead.
// Keyboard / screen-reader activation (a click without a pointer, detail 0) fires too.
export const PRESS_SLOP = 24;
export const pressHooks = { onGesture: null };   // called on every finger lift (full screen is restored there)

const over = (el, e) => {
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
};
const isOff = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true';

export function bindPress(el, fn) {
  let p = null, lastPointer = -1e9;
  const scroller = () => el.closest('.scroll');
  el.addEventListener('pointerdown', (e) => {
    if (p || isOff(el) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, y: e.clientY, ok: true };
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!p || e.pointerId !== p.id) return;
    const inside = Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= PRESS_SLOP || over(el, e);
    if (!inside) {
      const s = scroller();
      if (s) s.scrollTop -= e.clientY - p.y;
    }
    p.y = e.clientY;
    p.ok = inside;
    el.classList.toggle('down', inside);
  });
  const end = (e, cancelled) => {
    if (!p || e.pointerId !== p.id) return;
    lastPointer = performance.now();
    const fire = !cancelled && p.ok && !isOff(el);
    p = null;
    el.classList.remove('down');
    if (pressHooks.onGesture && !cancelled) pressHooks.onGesture();
    if (fire) fn(e);
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // keyboard / screen reader only: the click that follows a finger or mouse press (some browsers send
  // it with detail 0 too) must not press the button a second time
  el.addEventListener('click', (e) => { if (e.detail === 0 && !isOff(el) && performance.now() - lastPointer > 1000) fn(e); });
}
