import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverProviderCommands,
  discoverSkills,
  type SkillScanRoot,
} from "./command-discovery.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "bb-skill-budget-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function writeSkill(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    "---\ndescription: test skill\n---\n",
  );
}

function roots(): SkillScanRoot[] {
  return ["primary", "secondary"].map((name) => ({
    rootPath: path.join(tempRoot, name),
    shape: "skill-recursive",
    namePrefix: "",
    source: "skill",
    origin: "user",
    identitySeed: name,
    rootKind: "provider-user",
  }));
}

describe.each([
  ["commands", discoverProviderCommands],
  ["skills", discoverSkills],
] as const)("recursive %s discovery budgets", (_surface, discover) => {
  it("lists later and nested skills despite large supporting-file directories", async () => {
    const primarySkill = path.join(tempRoot, "primary", "first");
    const assets = path.join(primarySkill, "assets");
    await writeSkill(primarySkill);
    await mkdir(assets);
    for (let index = 0; index < 1_005; index += 1) {
      await writeFile(
        path.join(assets, `asset-${index}.txt`),
        "supporting data",
      );
    }
    await writeSkill(path.join(primarySkill, "nested", "inner"));
    await writeSkill(path.join(tempRoot, "secondary", "second"));

    const records = await discover({ roots: roots() });

    expect(records.map((record) => record.name).sort()).toEqual([
      "first",
      "inner",
      "second",
    ]);
  });

  it("continues with another root after exhausting a directory budget", async () => {
    const primary = path.join(tempRoot, "primary");
    await mkdir(primary);
    for (let index = 0; index < 1_005; index += 1) {
      await mkdir(path.join(primary, `directory-${index}`));
    }
    await writeSkill(path.join(tempRoot, "secondary", "second"));

    const records = await discover({ roots: roots() });

    expect(records.map((record) => record.name)).toEqual(["second"]);
  });
});
