// What to tell the player about the microphone on this device (plan-phone-mode §2.1, §10.1).
// dev: the mode object ({ mode, device }) from platform/mode.js.
import { S } from '../i18n/index.js';

const isIos = (dev) => dev && (dev.device === 'iPhone' || dev.device === 'iPad');
const isAndroid = (dev) => dev && dev.device === 'Android';

// The permission was refused: where to turn it back on
export function deniedHelp(dev) {
  if (isIos(dev)) return S.micHelp.deniedIos;
  if (isAndroid(dev)) return S.micHelp.deniedAndroid;
  return S.micHelp.denied;
}

// Before asking: what the dialogs will look like
export function promptHelp(dev) {
  if (isIos(dev)) return S.micHelp.promptIos;
  if (isAndroid(dev)) return S.micHelp.promptAndroid;
  return '';
}

// How to hold the phone while calibrating
export const HOLD_TEXT = S.micHelp.hold;

// iPhone: the side switch silences web audio
export const IOS_SOUND = S.micHelp.iosSound;
