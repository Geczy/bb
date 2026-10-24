import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const evidence = join(process.env.RUNNER_TEMP, 'cache-input-results');
mkdirSync(evidence, { recursive: true });
const results = [];
function outputs(dir) {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? Object.entries(outputs(file)) : [[file, createHash('sha256').update(readFileSync(file)).digest('hex')]];
  }).sort(([a], [b]) => a.localeCompare(b)));
}
function run(name, expectedCache) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [resolve('node_modules/turbo/bin/turbo'), 'run', 'build', 'build:types', '--filter=@get-bb/plugin-sdk', '--cache-dir=.turbo/cache-input-benchmark', '--cache=local:rw', '--output-logs=new-only', '--summarize'], { encoding: 'utf8' });
  const seconds = (performance.now() - started) / 1000;
  writeFileSync(join(evidence, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0) throw new Error(`${name} failed: ${result.status}`);
  const runs = readdirSync('.turbo/runs').filter((file) => file.endsWith('.json')).sort();
  const summaryPath = join('.turbo/runs', runs.at(-1));
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  copyFileSync(summaryPath, join(evidence, `${name}.json`));
  const tasks = summary.tasks.filter((task) => ['@get-bb/plugin-sdk#build', '@get-bb/plugin-sdk#build:types'].includes(task.taskId));
  if (tasks.length !== 2 || tasks.some((task) => task.cache.status !== expectedCache)) throw new Error(`${name}: expected ${expectedCache}, got ${JSON.stringify(tasks.map((task) => [task.taskId, task.cache.status]))}`);
  results.push({ name, seconds, tasks: tasks.map((task) => ({ task: task.taskId, cache: task.cache.status })) });
  writeFileSync(join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  return { ...outputs('packages/plugin-sdk/dist'), ...outputs('packages/plugin-sdk/bundled-types') };
}
const expected = JSON.stringify(run('seed', 'MISS'));
for (const [name, file, cache] of [
  ['sdk-test', 'packages/plugin-sdk/src/__tests__/cli-spec.test.ts', process.env.VARIANT === 'candidate' ? 'HIT' : 'MISS'],
  ['domain-test', 'packages/domain/test/thread.test.ts', process.env.VARIANT === 'candidate' ? 'HIT' : 'MISS'],
  ['source-control', 'packages/plugin-sdk/src/index.ts', 'MISS'],
]) {
  const original = readFileSync(file);
  try {
    writeFileSync(file, Buffer.concat([original, Buffer.from('\n')]));
    const actual = run(name, cache);
    if (JSON.stringify(actual) !== expected) throw new Error(`${name}: emitted output changed`);
  } finally {
    writeFileSync(file, original);
  }
}
console.log(JSON.stringify(results, null, 2));
