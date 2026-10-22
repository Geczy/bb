import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const label = process.argv[2];
if (!label) throw new Error('Missing label');
const variant = label.startsWith('before') ? 'before' : 'after';
writeFileSync('packages/plugin-sdk/scripts/build-bundled-dts.mjs', readFileSync(`scripts/ci-bench/declarations-${variant}.txt`));
rmSync('packages/plugin-sdk/bundled-types', { recursive: true, force: true });
const started = performance.now();
const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'turbo', 'run', 'build:types', '--filter=@get-bb/plugin-sdk', '--only', '--force', '--output-logs=full'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
const seconds = (performance.now() - started) / 1000;
writeFileSync(`declarations-${label}.log`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
if (result.status !== 0) throw new Error(`Build ${label} failed: ${result.stderr}; ${result.stdout}`);
const hashes = {};
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else hashes[path.replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
walk('packages/plugin-sdk/bundled-types');
const manifest = JSON.stringify(Object.fromEntries(Object.entries(hashes).sort()));
if (existsSync('declarations-manifest.json') && readFileSync('declarations-manifest.json', 'utf8') !== manifest) throw new Error(`Build output differs: ${label}`);
writeFileSync('declarations-manifest.json', manifest);
const stats = `${result.stdout}\n${result.stderr}`.match(/React Compiler cache: (\d+) hits, (\d+) misses/);
const row = { label, seconds, files: Object.keys(hashes).length, hits: stats?.[1], misses: stats?.[2] };
appendFileSync('declarations-results.jsonl', JSON.stringify(row) + '\n');
console.log(JSON.stringify(row));
