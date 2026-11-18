// Same version = same files (plan 2026-11-17 «Гра не завантажилась», step 6). Every module URL carries
// ?v=<version> and the service worker keeps those URLs for good (cache first), so a change to a served
// file without a new version (node tools/bump-version.mjs) leaves phones with old modules next to new
// ones. This finds the commit that set the current version (first-parent history: the branch's own
// line) and lists the served files changed since then.
//   node tools/version-check.mjs [ref]     ref (default: HEAD and the working tree); exit 1 if stale
//   staleVersion(ref, { worktree })        null when fine, else { version, since, files }
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SERVED = ['index.html', 'sw.js', 'privacy.html', 'manifest.webmanifest', 'src', 'vendor', 'icons', 'fonts'];
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).trim();

export function staleVersion(ref = 'HEAD', { worktree = false, cwd = process.cwd() } = {}) {
  let since, version;
  try {
    since = git(cwd, 'log', '--first-parent', '-1', '--format=%H', ref, '--', 'version.json');
    version = JSON.parse(git(cwd, 'show', `${ref}:version.json`)).version;
  } catch { return null; }   // no history here (a shallow clone, no version.json): nothing to say
  if (!since) return null;
  // the working tree (the tests, before a commit) or the ref itself (the site build)
  const files = (worktree ? git(cwd, 'diff', '--name-only', since, '--', ...SERVED) : git(cwd, 'diff', '--name-only', since, ref, '--', ...SERVED)).split('\n').filter(Boolean);
  if (worktree) {
    // a version bumped in the working tree but not committed yet is a new version
    try { if (JSON.parse(git(cwd, 'show', `${since}:version.json`)).version !== JSON.parse(readFileSync(join(cwd, 'version.json'), 'utf8')).version) return null; } catch { /* as committed */ }
  }
  return files.length ? { version, since: since.slice(0, 7), files } : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ref = process.argv[2];
  const r = staleVersion(ref || 'HEAD', { worktree: !ref, cwd: fileURLToPath(new URL('..', import.meta.url)) });
  if (!r) { console.log('version: ok'); process.exit(0); }
  console.log(`version ${r.version} (set in ${r.since}) but served files changed since: ${r.files.slice(0, 8).join(', ')}${r.files.length > 8 ? ', …' : ''}\nrun: node tools/bump-version.mjs <new version>`);
  process.exit(1);
}
