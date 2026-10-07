// Which version of the game this device gets (plan-phone-mode §3.1):
//   'vr'    a headset browser (Quest, Pico, Wolvic): 2D start screen, then Enter VR — as before
//   'phone' Android, iPhone, iPad and other touch-first devices
//   'pc'    keyboard and mouse; Enter VR stays for a PC headset or the WebXR emulator
// ?mode=vr|phone|pc overrides the detection and is remembered on this device; ?mode=auto forgets it.
// isSessionSupported('immersive-vr') is not used: Android Chrome may report Cardboard VR.
import { loadSetting, saveSetting } from '../settings.js';

export const MODE_NAMES = { vr: 'шолом (VR)', phone: 'телефон', pc: "комп'ютер" };
export const MIN_IOS = [16, 4];   // import maps (Safari 16.4); without them the game does not load

// Pure detection from the browser's own description; nav/media are injectable for tests.
export function detectDevice(nav = navigator, media = (q) => matchMedia(q).matches) {
  const ua = nav.userAgent || '';
  const touch = nav.maxTouchPoints || 0;
  const ios = /\b(iPhone|iPod|iPad)\b.*? OS (\d+)_(\d+)/.exec(ua);
  if (/OculusBrowser|\bQuest\b|Pico|Wolvic/i.test(ua)) return { mode: 'vr', device: 'шолом', os: '' };
  if (ios) return { mode: 'phone', device: ios[1] === 'iPad' ? 'iPad' : 'iPhone', os: `iOS ${ios[2]}.${ios[3]}`, ios: [+ios[2], +ios[3]] };
  // iPadOS 13+ presents itself as a Mac; a Mac has no touch screen
  if (/Macintosh/.test(ua) && touch > 1) {
    const v = /Version\/(\d+)\.(\d+)/.exec(ua);
    return { mode: 'phone', device: 'iPad', os: v ? `iPadOS ${v[1]}.${v[2]}` : 'iPadOS', ios: v ? [+v[1], +v[2]] : null };
  }
  const android = /Android\s*([\d.]*)/.exec(ua);
  // Chrome freezes the UA at "Android 10; K" (user-agent reduction): no version rather than a wrong
  // one; the real version and model come from userAgentData (refineAndroid)
  if (android) return { mode: 'phone', device: 'Android', os: /Android 10; K\b/.test(ua) ? '' : `Android ${android[1]}`.trim() };
  // e.g. Chrome's "desktop site" on a phone (no "Android" in the UA) or a touch-first tablet. The
  // primary pointer decides: Samsung phones also report a fine pointer (any-pointer: fine)
  if (touch > 0 && media('(pointer: coarse)')) return { mode: 'phone', device: 'сенсорний екран', os: '' };
  return { mode: 'pc', device: "комп'ютер", os: '' };
}

// Android version and model from userAgentData.getHighEntropyValues (Chrome), when the UA is frozen
export function refineAndroid(dev, uaData) {
  if (dev.device !== 'Android' || !uaData) return dev;
  const v = uaData.platformVersion ? uaData.platformVersion.split('.')[0] : '';
  return { ...dev, os: [v && `Android ${v}`, uaData.model].filter(Boolean).join(', ') || dev.os };
}

// iOS older than MIN_IOS (or null when unknown / not iOS)
export function iosTooOld(dev) {
  if (!dev.ios) return false;
  const [a, b] = dev.ios;
  return a < MIN_IOS[0] || (a === MIN_IOS[0] && b < MIN_IOS[1]);
}

// The mode for this page: { mode, auto, device, os, ios }
export function currentMode(search = location.search) {
  const dev = detectDevice();
  const p = new URLSearchParams(search).get('mode');
  if (p === 'auto') saveSetting('mode', null);
  else if (p && MODE_NAMES[p]) saveSetting('mode', p);
  const forced = loadSetting('mode', null);
  if (forced && MODE_NAMES[forced]) return { ...dev, mode: forced, auto: false, detected: dev.mode };
  return { ...dev, auto: true, detected: dev.mode };
}
