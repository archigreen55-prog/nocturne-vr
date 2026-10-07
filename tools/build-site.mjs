// Assembles the GitHub Pages site (see .github/workflows/pages.yml):
//   /                    main, file for file as GitHub Pages served the branch before
//   /preview/<branch>/   every other branch that has an index.html, to test on a phone before merging
//   /preview/            a list of the previews (branch, version, last commit)
// Only git-tracked files are copied (git archive); nothing from a branch is executed.
//   node tools/build-site.mjs [out-dir]      default _site; the branches must be fetched (origin/*)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '_site';
const MAIN = 'main';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

function exportTree(ref, dir) {
  mkdirSync(dir, { recursive: true });
  const tar = execFileSync('git', ['archive', '--format=tar', ref], { maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  rmSync(join(dir, '.github'), { recursive: true, force: true });   // workflows are not part of the site
}

// sha256 of every file under dir (relative path -> hash), for the log
function manifest(dir, skip = '') {
  const files = {};
  (function walk(d, rel) {
    for (const e of readdirSync(d)) {
      const p = join(d, e), r = rel ? `${rel}/${e}` : e;
      if (r === skip) continue;
      if (statSync(p).isDirectory()) walk(p, r);
      else files[r] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  })(dir, '');
  return files;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const versionOf = (ref) => { try { return JSON.parse(git('show', `${ref}:version.json`)).version; } catch { return '?'; } };

rmSync(out, { recursive: true, force: true });
exportTree(`origin/${MAIN}`, out);
const root = manifest(out);
const rootHash = createHash('sha256').update(Object.entries(root).sort().map(([f, h]) => `${h}  ${f}\n`).join('')).digest('hex');
console.log(`root: ${MAIN} ${git('rev-parse', '--short', `origin/${MAIN}`)}, version ${versionOf(`origin/${MAIN}`)}, ${Object.keys(root).length} files, tree sha256 ${rootHash.slice(0, 16)}`);

const previews = [];
for (const branch of git('for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin').split('\n')) {
  if (!branch || branch === 'HEAD' || branch === MAIN) continue;
  const ref = `origin/${branch}`;
  if (tryGit('cat-file', '-e', `${ref}:index.html`) === null) { console.log(`skip ${branch}: no index.html`); continue; }
  const slug = branch.replace(/[^A-Za-z0-9._-]+/g, '-');
  exportTree(ref, join(out, 'preview', slug));
  const [sha, date, subject] = git('log', '-1', '--format=%h%x00%cI%x00%s', ref).split('\0');
  previews.push({ branch, slug, sha, date, subject, version: versionOf(ref) });
  console.log(`preview/${slug}/: ${sha}, version ${previews.at(-1).version}`);
}
previews.sort((a, b) => b.date.localeCompare(a.date));

mkdirSync(join(out, 'preview'), { recursive: true });
writeFileSync(join(out, 'preview', 'previews.json'), JSON.stringify({ main: { sha: git('rev-parse', '--short', `origin/${MAIN}`), version: versionOf(`origin/${MAIN}`), tree: rootHash }, previews }, null, 2) + '\n');
writeFileSync(join(out, 'preview', 'index.html'), `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Nocturne: превʼю</title>
<style>
  body { margin: 0; padding: 16px; background: #0a0f1c; color: #e6ecf5; font: 16px/1.45 system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; } p { color: #93a1b8; margin: 4px 0 14px; font-size: 14px; }
  a.card { display: block; padding: 14px 16px; margin: 0 0 12px; border-radius: 12px; border: 1px solid #26314a; background: rgba(16, 22, 36, .95); color: inherit; text-decoration: none; }
  a.card b { color: #7fc8ff; font-size: 18px; } .meta { color: #93a1b8; font-size: 13px; margin-top: 4px; word-break: break-word; }
  a.main b { color: #5fd38d; }
</style></head><body>
<h1>Nocturne: превʼю</h1>
<p>Тестові версії з робочих гілок. Гравці бачать лише основний сайт.</p>
<a class="card main" href="../"><b>Основний сайт</b> · версія ${esc(versionOf(`origin/${MAIN}`))}<div class="meta">main</div></a>
${previews.length ? previews.map((p) => `<a class="card" href="./${encodeURI(p.slug)}/"><b>${esc(p.version)}</b><div class="meta">${esc(p.branch)} · ${esc(p.sha)} · ${esc(p.date.slice(0, 16).replace('T', ' '))}<br>${esc(p.subject)}</div></a>`).join('\n') : '<p>Зараз превʼю немає.</p>'}
</body></html>
`);
console.log(`${previews.length} preview(s) -> ${out}/preview/`);
