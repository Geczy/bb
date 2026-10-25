import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const directory = path.join(process.env.RUNNER_TEMP, "npm-workers");
mkdirSync(directory, { recursive: true });
const counts = process.env.BENCHMARK_ORDER === "ascending" ? [4, 8, 16, 16, 8, 4] : [16, 8, 4, 4, 8, 16];
const measurements = [];
for (const [index, workers] of counts.entries()) {
  const log = openSync(path.join(directory, `${index}-${workers}.log`), "w");
  const start = performance.now();
  const result = spawnSync("bash", ["-c", "pnpm exec turbo run smoke:tarball --filter=bb-app --only --force --env-mode=loose"], {
    stdio: ["ignore", log, log],
    env: { ...process.env, UV_THREADPOOL_SIZE: String(workers) },
  });
  closeSync(log);
  measurements.push({ index, workers, seconds: (performance.now() - start) / 1000, status: result.status, error: result.error?.message });
  writeFileSync(path.join(directory, "timings.json"), JSON.stringify(measurements, null, 2));
  if (result.status !== 0) process.exit(1);
}
