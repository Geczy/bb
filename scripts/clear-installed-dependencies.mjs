import { globSync, rmSync } from "node:fs";

for (const directory of globSync([
  "node_modules",
  "apps/*/node_modules",
  "packages/*/node_modules",
  "plugins/*/node_modules",
  "tests/*/node_modules",
  "examples/plugins/*/node_modules",
])) {
  rmSync(directory, { recursive: true, force: true });
}
