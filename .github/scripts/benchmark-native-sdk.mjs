import { copyFileSync, mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const directory = path.join(process.env.RUNNER_TEMP, "native-sdk");
mkdirSync(directory, { recursive: true });
const script = "packages/bb-app/scripts/build-public-sdk-dts.mjs";
const variants = process.env.BENCHMARK_ORDER === "baseline-first" ? ["baseline", "candidate", "candidate", "baseline"] : ["candidate", "baseline", "baseline", "candidate"];
const measurements = [];
for (const [index, variant] of variants.entries()) {
  copyFileSync(path.join(process.env.RUNNER_TEMP, `${variant}.mjs`), script);
  const log = openSync(path.join(directory, `${index}-${variant}.log`), "w");
  const start = performance.now();
  const result = spawnSync(process.execPath, [script], { stdio: ["ignore", log, log] });
  const seconds = (performance.now() - start) / 1000;
  closeSync(log);
  measurements.push({ index, variant, seconds, status: result.status, error: result.error?.message });
  writeFileSync(path.join(directory, "timings.json"), JSON.stringify(measurements, null, 2));
  if (result.status !== 0) process.exit(1);
  copyFileSync("packages/bb-app/dist/index.d.ts", path.join(directory, `${index}-${variant}.d.ts`));
}
for (const variant of ["baseline", "candidate"]) {
  const index = variants.indexOf(variant);
  copyFileSync(path.join(directory, `${index}-${variant}.d.ts`), "packages/bb-app/dist/index.d.ts");
  const log = openSync(path.join(directory, `${variant}-smoke.log`), "w");
  const result = spawnSync("pnpm", ["exec", "turbo", "run", "smoke:tarball", "--filter=bb-app", "--only", "--force"], { stdio: ["ignore", log, log] });
  closeSync(log);
  if (result.status !== 0) process.exit(1);
}
