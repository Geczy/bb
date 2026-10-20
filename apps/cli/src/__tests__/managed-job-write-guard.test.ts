import { execFile, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cliFetch } from "../client.js";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const production = "http://127.0.0.1:38886";
const code = "managed_job_default_server_write";
const fakeCredential = "fake-qa-credential";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("managed job transport guard", () => {
  it.each([
    ["127.0.0.1", "POST"],
    ["localhost", "PUT"],
    ["[::1]", "PATCH"],
    ["127.0.0.2", "DELETE"],
    ["LOCALHOST", "post"],
  ])("refuses %s %s without sending credentials", async (host, method) => {
    vi.stubEnv("HOST_CARE_JOB_ID", "job-test");
    vi.stubEnv("BB_ALLOW_DEFAULT_SERVER_WRITES", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = cliFetch(
      `http://user:${fakeCredential}@${host}:38886/private?key=${fakeCredential}`,
      { method, body: fakeCredential },
    );
    await expect(result).rejects.toMatchObject({ code });
    await expect(result).rejects.not.toThrow(fakeCredential);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", production, "job-test", ""],
    ["HEAD", production, "job-test", ""],
    ["OPTIONS", production, "job-test", ""],
    ["PUT", "http://127.0.0.1:49681", "job-test", ""],
    ["PUT", "https://example.com:38886", "job-test", ""],
    ["PUT", production, "", ""],
    ["PUT", production, undefined, ""],
    ["PUT", production, "job-test", "1"],
  ])(
    "permits %s %s marker=%s override=%s",
    async (method, url, marker, override) => {
      vi.stubEnv("HOST_CARE_JOB_ID", marker);
      vi.stubEnv("BB_ALLOW_DEFAULT_SERVER_WRITES", override);
      const response = new Response();
      const fetch = vi.fn().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetch);
      await expect(cliFetch(new URL(url), { method })).resolves.toBe(response);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, "0", "true", " 1"])(
    "requires the exact override, received %s",
    async (override) => {
      vi.stubEnv("HOST_CARE_JOB_ID", "job-test");
      vi.stubEnv("BB_ALLOW_DEFAULT_SERVER_WRITES", override);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(
        cliFetch(production, { method: "PUT" }),
      ).rejects.toMatchObject({ code });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("uses Request methods and gives init.method precedence", async () => {
    vi.stubEnv("HOST_CARE_JOB_ID", "job-test");
    vi.stubEnv("BB_ALLOW_DEFAULT_SERVER_WRITES", "");
    const fetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetch);
    await expect(
      cliFetch(new Request(production, { method: "POST" })),
    ).rejects.toMatchObject({ code });
    await expect(
      cliFetch(new Request(production), { method: "DELETE" }),
    ).rejects.toMatchObject({ code });
    expect(fetch).not.toHaveBeenCalled();
    await cliFetch(new Request(production, { method: "POST" }), {
      method: "GET",
    });
    await cliFetch(production);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

const mockFetch = `
import { appendFileSync } from "node:fs";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  appendFileSync(process.env.GUARD_PROBE_LOG, JSON.stringify({ method, url: url.href }) + "\\n");
  const body = url.pathname.endsWith("/contributions")
    ? { cliCommands: [{ pluginId: "guard-probe", name: "guard-probe", summary: "Probe", commands: [] }] }
    : url.pathname.endsWith("/cli")
      ? { exitCode: 0, stdout: "probe-ok", stderr: "" }
      : { ok: true, values: { probe: "untouched" }, schema: { probe: { type: "string", label: "Probe", default: "untouched" } } };
  return Response.json(body);
};
`;

describe("built CLI managed job regression", () => {
  let tempDir: string;
  let entry: string;
  let preload: string;

  beforeAll(async () => {
    await mkdir(join(cliRoot, ".tmp"), { recursive: true });
    tempDir = await mkdtemp(join(cliRoot, ".tmp/managed-job-guard-"));
    entry = join(tempDir, "dist/index.js");
    preload = join(tempDir, "mock-fetch.mjs");
    await writeFile(preload, mockFetch);
    await promisify(execFile)(
      process.execPath,
      [
        resolve(cliRoot, "../../scripts/build-node-entry.mjs"),
        "src/index.ts",
        entry,
        "--split",
      ],
      { cwd: cliRoot },
    );
    await chmod(entry, 0o755);
    await writeFile(
      join(tempDir, "launcher.mjs"),
      'import "./dist/index.js";\n',
    );
  }, 60_000);

  afterAll(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  async function run(
    args: string[],
    options: {
      url?: string;
      marker?: string;
      override?: string;
      reexec?: boolean;
    } = {},
  ) {
    const log = join(tempDir, "requests.jsonl");
    await writeFile(log, "");
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith("BB_") && key !== "NODE_OPTIONS",
      ),
    );
    env.HOST_CARE_JOB_ID = options.marker ?? "job-test";
    env.BB_CLI_ERROR_LOG = "0";
    env.GUARD_PROBE_LOG = log;
    env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
    if (options.url !== undefined) env.BB_SERVER_URL = options.url;
    if (options.override !== undefined)
      env.BB_ALLOW_DEFAULT_SERVER_WRITES = options.override;
    if (options.reexec) env.BB_CLI = entry;
    const result = spawnSync(
      process.execPath,
      [options.reexec ? join(tempDir, "launcher.mjs") : entry, ...args],
      { cwd: cliRoot, env, encoding: "utf8", timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    const requests = (await readFile(log, "utf8")).trim();
    return { ...result, requests };
  }

  const writeArgs = [
    "plugin",
    "config",
    "guard-probe",
    "set",
    "probe",
    fakeCredential,
    "--json",
  ];

  it.each([
    undefined,
    production,
    "http://localhost:38886",
    "http://[::1]:38886",
  ])("blocks the incident's config PUT with URL %s", async (url) => {
    const result = await run(writeArgs, { url });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(result.stderr).toContain(
      "set BB_SERVER_URL to your isolated server",
    );
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stdout + result.stderr).not.toContain(fakeCredential);
    expect(result.requests).toContain('"method":"GET"');
    expect(result.requests).not.toContain('"method":"PUT"');
  });

  it.each([
    ["guard-probe", "inspect", fakeCredential, "--json"],
    ["plugin", "run", "guard-probe", "inspect", fakeCredential, "--json"],
    ["plugin", "enable", "guard-probe", "--json"],
  ])("blocks plugin POST and core SDK mutations: %j", async (...args) => {
    const result = await run(args, { url: production });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(result.stdout + result.stderr).not.toContain(fakeCredential);
    expect(result.requests).not.toMatch(/"method":"(POST|PUT|PATCH|DELETE)"/);
  });

  it.each([
    { url: "http://127.0.0.1:49681" },
    { url: production, marker: "" },
    { url: production, override: "1" },
  ])("preserves allowed config writes: %j", async (options) => {
    const result = await run(writeArgs, options);
    expect(result.status).toBe(0);
    expect(result.requests).toContain('"method":"PUT"');
  });

  it.runIf(process.platform !== "win32")(
    "preserves guard and override through BB_CLI re-exec",
    async () => {
      const blocked = await run(writeArgs, { url: production, reexec: true });
      expect(blocked.status).toBe(1);
      expect(JSON.parse(blocked.stdout)).toMatchObject({ error: { code } });
      expect(blocked.requests).not.toContain('"method":"PUT"');
      const allowed = await run(writeArgs, {
        url: production,
        override: "1",
        reexec: true,
      });
      expect(allowed.status).toBe(0);
      expect(allowed.requests).toContain('"method":"PUT"');
    },
  );
});
