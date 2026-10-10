// The game's name for players: one constant. tools/bump-version.mjs writes it into the places that
// cannot import it (index.html <title> and apple-mobile-web-app-title, manifest.webmanifest,
// privacy.html); tests/i18n.test.mjs fails if one of them differs.
export const GAME_NAME = 'HUSH JOB';   // the owner's decision 4 (plan-W17-style.md)
