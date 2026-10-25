import { copyFileSync, mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const directory = path.join(process.env.RUNNER_TEMP, "registry-smoke");
mkdirSync(directory, { recursive: true });
const variants = process.env.BENCHMARK_ORDER === "baseline-first" ? ["baseline", "candidate", "candidate", "baseline"] : ["candidate", "baseline", "baseline", "candidate"];
const measurements = [];
for (const [index, variant] of variants.entries()) {
  copyFileSync(path.join(process.env.RUNNER_TEMP, `${variant}.mjs`), "packages/bb-app/scripts/smoke-tarball.mjs");
  const log = openSync(path.join(directory, `${index}-${variant}.log`), "w");
  const start = performance.now();
  const result = spawnSync("bash", ["-c", "pnpm exec turbo run smoke:tarball --filter=bb-app --only --force --env-mode=loose"], { stdio: ["ignore", log, log] });
  closeSync(log);
  measurements.push({ index, variant, seconds: (performance.now() - start) / 1000, status: result.status, error: result.error?.message });
  writeFileSync(path.join(directory, "timings.json"), JSON.stringify(measurements, null, 2));
  if (result.status !== 0) process.exit(1);
}
