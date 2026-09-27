// Small per-viewer settings kept in localStorage (may be unavailable: then defaults apply).
export function loadSetting(key, fallback) {
  try {
    const v = localStorage.getItem('nocturne.' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function saveSetting(key, value) {
  try { localStorage.setItem('nocturne.' + key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
