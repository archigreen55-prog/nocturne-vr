// Phone screen while playing (plan-phone-mode §1.9, §10.1): full screen and landscape lock where
// the browser allows it (Android Chrome; iPhone Safari has neither: there the "rotate the phone"
// overlay and the safe-area layout do the job), and the screen kept on during a round (Wake Lock;
// re-requested when the page comes back, since the browser drops it when the page is hidden).
let lock = null, wanted = false;

async function requestWakeLock() {
  if (!wanted || lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { lock = null; /* not allowed (battery saver, old browser) */ }
}
document.addEventListener('visibilitychange', requestWakeLock);

// Call from the "Грати" tap (a user gesture is required for full screen).
export function enterPhonePlay() {
  wanted = true;
  requestWakeLock();
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null)
      .catch(() => { /* refused or not supported: the rotate overlay still asks for landscape */ });
  }
}

export function leavePhonePlay() {
  wanted = false;
  if (lock) { lock.release().catch(() => {}); lock = null; }
}

export const screenState = () => ({ fullscreen: !!document.fullscreenElement, wakeLock: !!lock, fullscreenApi: !!document.documentElement.requestFullscreen });
