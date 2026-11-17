// Neon Bay — the entrypoint for make.fun's gta6-01 bounty (Node 22, standard
// library only). The game itself lives in game/ as plain static files and
// its screenshots in screenshots/. This program hands the entry in: it
// copies both trees into the output directory and writes dossier.json
// with the vendored make.fun library, so the scorer and the judge read
// exactly what is in this repository. Run it locally with
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and the same bytes come out every time: no timestamps, no randomness,
// nothing but the files above.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps for this bounty (reference/gate.json): the text
// cap shapes the dossier, the rest refuse an entry the scorer would
// refuse, so check them here before writing anything.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function countEntries(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += 1;
    if (entry.isDirectory()) n += countEntries(join(dir, entry.name));
  }
  return n;
}

function totalBytes(dir: string): number {
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) bytes += totalBytes(full);
    else bytes += statSync(full).size;
  }
  return bytes;
}

function fail(message: string): never {
  throw new Error(`neon-bay main.ts: ${message}`);
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(gameDir)) fail('game/ is missing from the repository');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
if (!existsSync(shotsDir)) fail('screenshots/ is missing from the repository');

const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
}
for (const shot of shots) {
  const size = statSync(join(shotsDir, shot)).size;
  if (size > CAPS.screenshots.max_bytes) fail(`screenshot ${shot} is ${size} bytes, over the 256 KiB cap`);
}
if (countEntries(gameDir) > CAPS.game_max_files) fail('game/ holds too many files');
if (totalBytes(gameDir) > CAPS.game_max_bytes) fail('game/ is over the 48 MiB cap');

// Start from a clean output directory so a stale file can never leak in.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: CAPS.text_max_bytes,
  screenshots: { max: CAPS.screenshots.max, max_bytes: CAPS.screenshots.max_bytes },
  game_max_files: CAPS.game_max_files,
  game_max_bytes: CAPS.game_max_bytes,
  game_path_max_bytes: CAPS.game_path_max_bytes,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Neon Bay entry written to ${outDir}: ${shots.length} screenshots, dossier ${dossier.length} bytes.`);
