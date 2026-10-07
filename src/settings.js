// Small per-viewer settings kept in localStorage (may be unavailable: then defaults apply).
// Test builds under /preview/<branch>/ share the main site's origin, so they save under their own
// prefix (a test build cannot spoil a player's calibration or stars) and, until they have saved a
// value of their own, read the main site's.
export const PREVIEW = /\/preview\//.test(location.pathname);
const PREFIX = PREVIEW ? 'nocturne.preview.' : 'nocturne.';

export function loadSetting(key, fallback) {
  try {
    let v = localStorage.getItem(PREFIX + key);
    if (v === null && PREVIEW) v = localStorage.getItem('nocturne.' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function saveSetting(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
// All saved settings of this build (for the report)
export function allSettings() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('nocturne.')) continue;
      try { out[k] = JSON.parse(localStorage.getItem(k)); } catch { out[k] = localStorage.getItem(k); }
    }
  } catch { /* storage blocked */ }
  return out;
}
