import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const [mode, label] = process.argv.slice(2);
const store = join(process.env.RUNNER_TEMP, 'ci-bench-store');
if (mode === 'clean') {
  rmSync('node_modules', {recursive: true, force: true});
  for (const root of ['apps', 'packages', 'plugins', 'tests', 'examples/plugins']) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, {withFileTypes: true})) {
      if (entry.isDirectory()) rmSync(join(root, entry.name, 'node_modules'), {recursive: true, force: true});
    }
  }
  rmSync(store, {recursive: true, force: true});
} else if (mode === 'install') {
  const started = performance.now();
  const result = spawnSync('pnpm.cmd', ['install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts', '--fetch-timeout=30000', '--fetch-retries=2', '--fetch-retry-mintimeout=1000', '--fetch-retry-maxtimeout=5000', '--store-dir', store, '--filter', 'bb', '--filter', '@bb/server...', '--filter', '@bb/host-daemon...', '--filter', '@bb/app...', '--filter', 'bb-plugin-*...'], {encoding:'utf8', shell:true, maxBuffer:64*1024*1024});
  const seconds = (performance.now() - started) / 1000;
  writeFileSync(`store-${label}.log`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  const row = {label, seconds, status:result.status};
  appendFileSync('store-results.jsonl', JSON.stringify(row)+'\n');
  console.log(JSON.stringify(row));
  if (result.status !== 0) throw new Error(`Install failed: ${result.stdout}; ${result.stderr}`);
} else throw new Error(`Unknown mode ${mode}`);
