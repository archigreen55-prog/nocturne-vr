// Cloud tests (no phone, no headset): mode detection, the report, boot failure messages, preview
// settings, the fake microphone, and a VR regression in the WebXR emulator (IWER, Quest 3).
//   npm install && npm test            (Chromium from Playwright; WebKit is not available here)
//   ONLY=word npm test                 the tests whose name contains the word
//   FILE=topic npm test                one file: tests/<topic>.test.mjs (comma-separated for several)
//   LIST=1 npm test                    print the test names, run nothing
// Every tests/*.test.mjs is found here: a new topic is a new file, nothing to register.
// The shared server, browser, helpers and the run loop are in tests/runner.mjs.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runAll, testNames } from './runner.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const pick = process.env.FILE ? process.env.FILE.split(',').map((s) => s.trim()) : null;
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()
  .filter((f) => !pick || pick.includes(f.replace(/\.test\.mjs$/, '')));
if (pick && !files.length) { console.log(`FILE=${process.env.FILE}: no such tests/<topic>.test.mjs`); process.exit(1); }
for (const f of files) await import(new URL(f, import.meta.url));

if (process.env.LIST) { console.log(testNames().join('\n')); process.exit(0); }
process.exit((await runAll()) ? 1 : 0);
