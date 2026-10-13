import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  keychain: new Map<string, string>(),
  security: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: readonly string[],
    _options: object,
    callback: (
      error: Error | null,
      result: { stdout: string; stderr: string },
    ) => void,
  ) => {
    state.security(file, args);
    const value = state.keychain.get(args[args.indexOf("-s") + 1] ?? "");
    callback(value === undefined ? new Error("Item not found") : null, {
      stdout: value ?? "",
      stderr: "",
    });
  },
}));

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    default: {
      ...original,
      homedir: () => "/test/home",
      userInfo: () => ({ username: "test-user" }),
    },
  };
});

vi.mock("node:fs/promises", () => ({
  default: {
    access: async (file: string) => {
      if (!state.files.has(file)) throw new Error("ENOENT");
    },
    readFile: async (file: string) => {
      const value = state.files.get(file);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
  },
}));

vi.mock("@get-bb/plugin-sdk/provider-bridge", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@get-bb/plugin-sdk/provider-bridge")
  >()),
  experimental_resolveExecutablePath: () => Promise.resolve("/test/claude"),
  experimental_readCliVersion: () => Promise.resolve("2.1.296"),
}));

import {
  getClaudeProviderHealth,
  getClaudeProviderUsage,
} from "./provider-maintenance.js";

const originalPlatform = process.platform;
const defaultDir = path.join("/test/home", ".claude");
const customDir = "/test/home/custom-claude";
const defaultService = "Claude Code-credentials";
const customService = "Claude Code-credentials-07a20a2a";
const storageDir = " ~/cafe\u0301/../secure-store ";
const storageService = "Claude Code-credentials-017dfee1";
const accountUuid = "11111111-1111-4111-8111-111111111111";

function credentials(accessToken: string, expiresAt = 4_102_444_800_000) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken,
      expiresAt,
      subscriptionType: "pro",
      rateLimitTier: "default_claude_max_5x",
    },
  });
}

function account(emailAddress: string) {
  return JSON.stringify({ oauthAccount: { emailAddress, accountUuid } });
}

function platform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { configurable: true, value });
}

async function expectProfile(token: string, email: string | null) {
  expect(await getClaudeProviderHealth()).toMatchObject({
    supported: true,
    health: { status: "ready", accountEmail: email, planLabel: "Max (5x)" },
  });
  expect(await getClaudeProviderUsage()).toMatchObject({
    supported: true,
    usage: {
      status: "ok",
      accountEmail: email,
      accountKey: email === null ? null : `anthropic:account:${accountUuid}`,
      windows: [{ kind: "five-hour", usedPercent: 12 }],
    },
  });
  expect(state.fetch).toHaveBeenCalledWith(
    "https://api.anthropic.com/api/oauth/usage",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
    }),
  );
}

beforeEach(() => {
  platform("darwin");
  vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
  vi.stubEnv("CLAUDE_SECURESTORAGE_CONFIG_DIR", undefined);
  state.files.clear();
  state.keychain.clear();
  state.security.mockClear();
  state.fetch.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ five_hour: { utilization: 12 } }),
  });
  vi.stubGlobal("fetch", state.fetch);
  state.files.set(
    path.join(defaultDir, ".credentials.json"),
    credentials("default-file"),
  );
  state.files.set(
    path.join("/test/home", ".claude.json"),
    account("default@example.com"),
  );
  state.keychain.set(defaultService, credentials("default-keychain"));
});

afterEach(() => {
  platform(originalPlatform);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Claude Code credential loading", () => {
  it("loads a hex-encoded default Keychain credential before the file", async () => {
    state.keychain.set(
      defaultService,
      Buffer.from(credentials("default-keychain")).toString("hex"),
    );
    await expectProfile("default-keychain", "default@example.com");
  });

  it("uses the default credential file when the Keychain value is invalid", async () => {
    state.keychain.set(defaultService, "invalid-keychain-value");
    await expectProfile("default-file", "default@example.com");
  });

  it.each(["linux", "win32"] as const)(
    "reads the selected profile on %s despite an expired default profile",
    async (os) => {
      platform(os);
      vi.stubEnv("CLAUDE_CONFIG_DIR", customDir);
      state.files.set(
        path.join(defaultDir, ".credentials.json"),
        credentials("expired-default", 1),
      );
      state.files.set(
        path.join(customDir, ".credentials.json"),
        credentials("custom-file"),
      );
      state.files.set(
        path.join(customDir, ".claude.json"),
        account("custom@example.com"),
      );

      await expectProfile("custom-file", "custom@example.com");
      expect(state.security).not.toHaveBeenCalled();
    },
  );

  it.each([
    [customDir, customService],
    ["/test/home/.claude", "Claude Code-credentials-c68f71e9"],
    ["/test/home/unused/../custom-claude", "Claude Code-credentials-54b7ec58"],
    ["custom-claude", "Claude Code-credentials-826ee3b0"],
    ["~/custom-claude", "Claude Code-credentials-b47e5523"],
    ["/test/home/cafe\u0301", "Claude Code-credentials-c9b4c2c5"],
    [" /test/home/custom-claude ", "Claude Code-credentials-aaa5fee7"],
  ])("selects the CLI Keychain profile for %s", async (configDir, service) => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
    state.keychain.set(defaultService, credentials("expired-default", 1));
    state.keychain.set(service, credentials("custom-keychain"));
    state.files.set(
      path.join(configDir.normalize("NFC"), ".credentials.json"),
      credentials("expired-custom-file", 1),
    );
    state.files.set(
      path.join(configDir, ".claude.json"),
      account("custom@example.com"),
    );

    await expectProfile("custom-keychain", "custom@example.com");
  });

  it.each([
    ["linux", "", defaultDir, defaultService, "selected-file"],
    ["darwin", "", defaultDir, defaultService, "selected-keychain"],
    [
      "linux",
      storageDir,
      storageDir.normalize("NFC"),
      storageService,
      "selected-file",
    ],
    [
      "darwin",
      storageDir,
      storageDir.normalize("NFC"),
      storageService,
      "selected-keychain",
    ],
    [
      "darwin",
      storageDir,
      storageDir.normalize("NFC"),
      storageService,
      "selected-file",
    ],
  ] as const)(
    "honors %s storage override %j using %s / %s / %s without moving account metadata",
    async (os, override, directory, service, token) => {
      platform(os);
      vi.stubEnv("CLAUDE_CONFIG_DIR", customDir);
      vi.stubEnv("CLAUDE_SECURESTORAGE_CONFIG_DIR", override);
      state.files.set(
        path.join(customDir, ".credentials.json"),
        credentials("expired-settings-file", 1),
      );
      state.keychain.set(
        customService,
        credentials("expired-settings-keychain", 1),
      );
      state.files.set(
        path.join(directory, ".credentials.json"),
        credentials("selected-file"),
      );
      state.keychain.set(
        service,
        token === "selected-keychain"
          ? credentials(token)
          : "invalid-keychain-value",
      );
      state.files.set(
        path.join(directory, ".config.json"),
        account("storage@example.com"),
      );
      state.files.set(
        path.join(customDir, ".claude.json"),
        account("settings@example.com"),
      );

      await expectProfile(token, "settings@example.com");
    },
  );

  it.each([undefined, "invalid-keychain-value"])(
    "falls back within the custom profile for Keychain value %s",
    async (keychain) => {
      vi.stubEnv("CLAUDE_CONFIG_DIR", customDir);
      if (keychain !== undefined) state.keychain.set(customService, keychain);
      state.files.set(
        path.join(customDir, ".credentials.json"),
        credentials("custom-file"),
      );
      state.files.set(
        path.join(customDir, ".claude.json"),
        account("custom@example.com"),
      );

      await expectProfile("custom-file", "custom@example.com");
    },
  );

  it.each([
    ["linux", undefined],
    ["darwin", undefined],
    ["linux", storageDir],
    ["darwin", storageDir],
  ] as const)(
    "does not borrow another signed-in account for a missing custom profile on %s with storage override %j",
    async (os, override) => {
      platform(os);
      vi.stubEnv("CLAUDE_CONFIG_DIR", customDir);
      vi.stubEnv("CLAUDE_SECURESTORAGE_CONFIG_DIR", override);
      if (override !== undefined) {
        state.files.set(
          path.join(customDir, ".credentials.json"),
          credentials("settings-file"),
        );
        state.keychain.set(customService, credentials("settings-keychain"));
      }

      expect(await getClaudeProviderHealth()).toMatchObject({
        health: { status: "unauthenticated", accountEmail: null },
      });
      expect(await getClaudeProviderUsage()).toMatchObject({
        usage: { status: "unauthenticated" },
      });
      expect(state.fetch).not.toHaveBeenCalled();
    },
  );

  it("does not borrow default metadata when the custom account file is missing", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", customDir);
    state.keychain.set(customService, credentials("custom-keychain"));

    await expectProfile("custom-keychain", null);
  });

  it("uses the custom legacy account file ahead of .claude.json", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", customDir);
    state.keychain.set(customService, credentials("custom-keychain"));
    state.files.set(
      path.join(customDir, ".config.json"),
      account("legacy@example.com"),
    );
    state.files.set(
      path.join(customDir, ".claude.json"),
      account("other@example.com"),
    );

    await expectProfile("custom-keychain", "legacy@example.com");
  });

  it("distinguishes usage-check throttling from an exhausted Claude limit", async () => {
    state.fetch.mockResolvedValue({ ok: false, status: 429 });
    expect(await getClaudeProviderUsage()).toEqual({
      supported: true,
      usage: expect.objectContaining({
        status: "error",
        message:
          "Anthropic temporarily throttled this usage check. This does not mean your Claude limit is exhausted. Try again later.",
      }),
    });
  });
});
