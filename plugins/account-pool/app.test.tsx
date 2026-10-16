// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import fs, { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { z } from "zod";
import { accountSchema, statusSchema } from "./src/contracts.js";
import { accountPoolRpcContract } from "./src/rpc.js";
import { createAccountPoolPlugin } from "./src/server.js";
import type {
  AccountPoolConfig,
  AccountSummary,
  PoolStatus,
} from "./src/contracts.js";

const app = await loadPluginApp(() => import("./app"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const STATUS_CACHE_KEY = "account-pool:status";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function measureAccountRows() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const handle = this.querySelector(
        'button[aria-roledescription="sortable"]',
      );
      const rows = Array.from(this.parentElement?.children ?? []);
      return new DOMRect(0, handle ? rows.indexOf(this) * 60 : 0, 600, 60);
    },
  );
}

async function keyboardMove(handle: HTMLElement, code = "ArrowDown") {
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space" });
  await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("true"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.keyDown(document, { code });
}

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "claude",
    kind: "oauth",
    label: "person@example.com",
    email: "person@example.com",
    accountUuid: null,
    subscriptionType: "Max",
    rateLimitTier: "default_claude_max_5x",
    enabled: true,
    priority: 100,
    createdAt: 1,
    lastUsedAt: 2,
    lastUsedHostId: "host-one",
    lastUsedHostName: "bee",
    fiveHourUtilization: 0.21,
    fiveHourResetAt: null,
    fiveHourStatus: null,
    sevenDayUtilization: null,
    sevenDayResetAt: null,
    sevenDayStatus: null,
    representativeClaim: null,
    familyWeekly: {
      fable: null,
      sonnet: null,
      opus: null,
      haiku: null,
      other: null,
    },
    limitWindows: [],
    extraUsage: null,
    usageRestriction: null,
    observedAt: 1,
    heldUntil: null,
    error: null,
    inFlight: 0,
    status: "ready",
    ...overrides,
  };
}

function status(accounts: AccountSummary[] = [account()]): PoolStatus {
  return {
    route: "/api/v1/plugins/account-pool/http",
    enabledAccountCount: accounts.filter((item) => item.enabled).length,
    inFlight: 2,
    accepting: true,
    hosts: [
      { hostId: "host-one", hostName: "bee", mintedAt: 1, lastUsedAt: 2 },
    ],
    accounts,
    routing: { claude: true, codex: true },
    parent: null,
  };
}

function config(overrides: Partial<AccountPoolConfig> = {}): AccountPoolConfig {
  return {
    anthropicUpstreamBaseUrl: "https://api.anthropic.com",
    codexUpstreamBaseUrl: "https://chatgpt.com/backend-api/codex",
    switchThreshold: 0.98,
    parentMode: "proxy",
    ...overrides,
  };
}

function render(
  accounts = [account()],
  extraRpc: Record<string, () => object | null | Promise<object | null>> = {},
  copyToClipboard?: () => Promise<boolean>,
) {
  return renderSlot(
    app.settingsSections[0]!,
    {},
    {
      rpc: {
        "status.get": () => status(accounts),
        "config.get": () => config(),
        ...extraRpc,
      },
      experimental_rpcTags: (method) => ({
        tags: method === "config.get" ? ["config"] : ["accounts", "config"],
      }),
      openUrl: () => true,
      experimental_copyToClipboard: copyToClipboard,
    },
  );
}

describe("Account Pool parent banner", () => {
  const PARENT_URL = "http://127.0.0.1:25231/api/v1/plugins/account-pool/http";

  function renderWithParent(parent: PoolStatus["parent"]) {
    return renderSlot(
      app.settingsSections[0]!,
      {},
      {
        rpc: {
          "status.get": () => ({ ...status(), parent }),
          "config.get": () => config(),
        },
        openUrl: () => true,
      },
    );
  }

  it("says nothing about a parent when this server has none", async () => {
    const slot = renderWithParent(null);
    expect(await slot.findByText("person@example.com")).toBeTruthy();
    expect(slot.queryByText(/Account Pooler available/i)).toBeNull();
  });

  it("invites pooling through the parent while isolated, without leaking the api path", async () => {
    const slot = renderWithParent({
      baseUrl: PARENT_URL,
      mode: "isolate",
      availability: { claude: true, codex: true },
    });
    expect(
      await slot.findByText("Parent Account Pooler available"),
    ).toBeTruthy();
    expect(
      slot.getByText(/started from a thread on 127\.0\.0\.1:25231/),
    ).toBeTruthy();
    expect(slot.queryByText(/api\/v1\/plugins/)).toBeNull();
  });

  it("names both providers and says local accounts go unused while proxying", async () => {
    const slot = renderWithParent({
      baseUrl: PARENT_URL,
      mode: "proxy",
      availability: { claude: true, codex: true },
    });
    expect(
      await slot.findByText("Using the parent Account Pooler"),
    ).toBeTruthy();
    expect(
      slot.getByText(
        /Claude and Codex requests are sent to the pool on 127\.0\.0\.1:25231\. Accounts on this server are not used/,
      ),
    ).toBeTruthy();
  });

  it("calls out a provider the parent cannot serve", async () => {
    const slot = renderWithParent({
      baseUrl: PARENT_URL,
      mode: "proxy",
      availability: { claude: true, codex: false },
    });
    expect(
      await slot.findByText(
        /Claude requests are sent to the pool on .*Codex has no accounts there, so those requests fall back/,
      ),
    ).toBeTruthy();
  });

  it("says nothing is routed when the parent has no accounts at all", async () => {
    const slot = renderWithParent({
      baseUrl: PARENT_URL,
      mode: "proxy",
      availability: { claude: false, codex: false },
    });
    expect(
      await slot.findByText(/has no accounts available right now/),
    ).toBeTruthy();
  });
});

describe("Account Pool settings", () => {
  it("renders cached accounts as refreshing until live status arrives, then caches it", async () => {
    window.localStorage.setItem(
      STATUS_CACHE_KEY,
      JSON.stringify(status([account({ fiveHourUtilization: 0.21 })])),
    );
    const live = deferred<PoolStatus>();
    const slot = render([], { "status.get": () => live.promise });
    expect(slot.getByText("person@example.com")).toBeTruthy();
    expect(slot.getByText("21%")).toBeTruthy();
    expect(slot.getByText("refreshing usage…")).toBeTruthy();
    expect(slot.getByText(/· refreshing…$/)).toBeTruthy();
    expect(slot.queryByText("Loading…")).toBeNull();
    expect(slot.queryByText("No accounts in the pool")).toBeNull();
    live.resolve(status([account({ fiveHourUtilization: 0.6 })]));
    expect(await slot.findByText("60%")).toBeTruthy();
    expect(slot.queryByText("refreshing usage…")).toBeNull();
    expect(slot.queryByText(/· refreshing…$/)).toBeNull();
    const cached = JSON.parse(
      window.localStorage.getItem(STATUS_CACHE_KEY) ?? "null",
    ) as PoolStatus;
    expect(cached.accounts[0]?.fiveHourUtilization).toBe(0.6);
  });

  it("ignores a malformed status cache and shows the loading state", async () => {
    window.localStorage.setItem(STATUS_CACHE_KEY, '{"accounts":"nope"}');
    const live = deferred<PoolStatus>();
    const slot = render([], { "status.get": () => live.promise });
    expect(slot.getAllByText("Loading…")).toHaveLength(2);
    live.resolve(status());
    expect(await slot.findByText("person@example.com")).toBeTruthy();
  });

  it("marks a row as refreshing while its usage refresh is in flight", async () => {
    const refresh = deferred<{ account: null }>();
    const slot = render([account()], {
      "account.refreshUsage": () => refresh.promise,
    });
    fireEvent.pointerDown(
      await slot.findByRole("button", { name: "person@example.com actions" }),
    );
    fireEvent.click(await slot.findByText("Refresh usage"));
    expect(await slot.findByText("refreshing usage…")).toBeTruthy();
    refresh.resolve({ account: null });
    await waitFor(() =>
      expect(slot.queryByText("refreshing usage…")).toBeNull(),
    );
  });

  it("renders fixed quota slots with missing buckets as em dashes", async () => {
    const slot = render();
    expect(await slot.findByText("person@example.com")).toBeTruthy();
    expect(slot.getByText("5H")).toBeTruthy();
    expect(slot.getByText("7D")).toBeTruthy();
    expect(slot.getByText("FABLE")).toBeTruthy();
    expect(slot.getAllByText("—")).toHaveLength(2);
    expect(
      slot.getByText("Hub accepting · 2 in flight · used by bee"),
    ).toBeTruthy();
  });

  it("keeps the quota slots visible at mobile widths", async () => {
    const slot = render();
    const group = (await slot.findByText("5H")).parentElement?.parentElement;
    expect(group).toBeTruthy();
    expect(group?.className).not.toMatch(/(^|\s)hidden(\s|$)/u);
  });

  it("renders only the windows a Codex account reports and no Fable slot", async () => {
    const blockingResetAt = Date.now() + 6 * 24 * 60 * 60 * 1_000;
    const slot = render([
      account({
        id: "22222222-2222-4222-8222-222222222222",
        provider: "codex",
        label: "pro@example.com",
        codexAccountId: "chatgpt-account",
        status: "exhausted",
        fiveHourUtilization: 0.25,
        fiveHourResetAt: Date.now() + 60 * 60 * 1_000,
        limitWindows: [
          {
            slot: "primary",
            windowMinutes: 10_080,
            utilization: 1,
            resetAt: blockingResetAt,
            status: "rejected",
            observedAt: 1,
            source: "usage",
          },
        ],
      }),
    ]);
    expect(await slot.findByText("pro@example.com")).toBeTruthy();
    expect(slot.getByText("7D")).toBeTruthy();
    expect(slot.getByText("100%")).toBeTruthy();
    expect(slot.queryByText("5H")).toBeNull();
    expect(slot.queryByText("FABLE")).toBeNull();
    expect(
      slot.getByText(
        `Exhausted · resets ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(blockingResetAt)}`,
      ),
    ).toBeTruthy();
    fireEvent.click(
      await slot.findByRole("button", { name: "Open pro@example.com details" }),
    );
    expect(await slot.findByText("Weekly")).toBeTruthy();
    expect(slot.queryByText("5 hour")).toBeNull();
    expect(slot.queryByText("7 day")).toBeNull();
  });

  it.each([
    {
      action: "Disable",
      method: "account.disable",
      input: { id: account().id },
    },
    {
      action: "Refresh usage",
      method: "account.refreshUsage",
      input: { accountId: account().id },
    },
  ])(
    "dispatches $action to its RPC contract",
    async ({ action, method, input }) => {
      const slot = render([account()], {
        [method]: () => ({ account: null }),
      });
      fireEvent.pointerDown(
        await slot.findByRole("button", { name: "person@example.com actions" }),
      );
      fireEvent.click(await slot.findByText(action));
      expect(slot.rpcCalls).toContainEqual({ method, input });
    },
  );

  it("confirms Remove before dispatching its RPC contract", async () => {
    const slot = render([account()], {
      "account.remove": () => ({ removed: true }),
    });
    fireEvent.pointerDown(
      await slot.findByRole("button", { name: "person@example.com actions" }),
    );
    fireEvent.click(await slot.findByText("Remove"));
    expect(await slot.findByText("Remove person@example.com?")).toBeTruthy();
    expect(slot.rpcCalls.some((call) => call.method === "account.remove")).toBe(
      false,
    );
    fireEvent.click(slot.getByRole("button", { name: "Remove" }));
    expect(slot.rpcCalls).toContainEqual({
      method: "account.remove",
      input: { id: account().id },
    });
  });

  it("opens the correct provider sign-in flow from each Add account menu", async () => {
    const slot = render([], {
      "login.start": () => ({
        sessionId: "22222222-2222-4222-8222-222222222222",
        authorizeUrl: "https://claude.ai/oauth/authorize",
      }),
      "codexLogin.start": () => ({
        sessionId: "33333333-3333-4333-8333-333333333333",
        verificationUri: "https://auth.openai.com/codex/device",
        userCode: "ABCD-1234",
        expiresAt: Date.now() + 600_000,
        intervalMs: 60_000,
      }),
    });
    const addButtons = await slot.findAllByRole("button", {
      name: "Add account",
    });
    fireEvent.pointerDown(addButtons[0]!);
    fireEvent.click(
      await slot.findByText("Sign in to Claude", { selector: "span.block" }),
    );
    expect(
      await slot.findByLabelText("Claude authorization code"),
    ).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Close" }));
    fireEvent.pointerDown(addButtons[1]!);
    fireEvent.click(
      await slot.findByText("Sign in to Codex", { selector: "span.block" }),
    );
    expect(
      (await slot.findByLabelText("Codex user code")).textContent,
    ).toContain("ABCD-1234");
  });

  it("persists provider routing from the section switch", async () => {
    const slot = render([account()], {
      "routing.set": () => ({ provider: "claude", enabled: false }),
    });
    fireEvent.click(
      await slot.findByRole("switch", { name: "Route Claude threads" }),
    );
    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual({
        method: "routing.set",
        input: { provider: "claude", enabled: false },
      }),
    );
  });

  it("edits Advanced config fields and shows URL validation inline", async () => {
    const nextConfig = config({
      anthropicUpstreamBaseUrl: "https://proxy.example.com",
    });
    const slot = render([account()], {
      "config.set": () => nextConfig,
    });
    fireEvent.click(await slot.findByRole("button", { name: "Advanced" }));
    const anthropic = await slot.findByLabelText("Anthropic upstream base URL");
    if (!(anthropic instanceof HTMLInputElement)) {
      throw new Error("Expected the Anthropic config field to be an input.");
    }
    await waitFor(() =>
      expect(anthropic.value).toBe("https://api.anthropic.com"),
    );
    expect(slot.getByLabelText("Codex upstream base URL")).toBeTruthy();
    expect(slot.getByLabelText("Quota switch threshold")).toBeTruthy();

    fireEvent.change(anthropic, { target: { value: "ftp://invalid.example" } });
    fireEvent.blur(anthropic);
    expect(await slot.findByText("Must be an HTTP or HTTPS URL.")).toBeTruthy();
    expect(slot.rpcCalls.some((call) => call.method === "config.set")).toBe(
      false,
    );

    fireEvent.change(anthropic, {
      target: { value: "https://proxy.example.com" },
    });
    fireEvent.blur(anthropic);
    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual({
        method: "config.set",
        input: { anthropicUpstreamBaseUrl: "https://proxy.example.com" },
      }),
    );
  });

  it("shows every observed family bucket in the detail dialog", async () => {
    const fable = {
      utilization: 0.91,
      resetAt: Date.now() + 3_600_000,
      status: null,
      observedAt: 1,
      source: "usage" as const,
    };
    const slot = render([
      account({
        familyWeekly: {
          fable,
          sonnet: null,
          opus: { ...fable, utilization: 0.2 },
          haiku: null,
          other: null,
        },
      }),
    ]);
    fireEvent.click(
      await slot.findByRole("button", {
        name: "Open person@example.com details",
      }),
    );
    expect(await slot.findByText("Fable 7 day")).toBeTruthy();
    expect(slot.getByText("Opus 7 day")).toBeTruthy();
  });

  it("shows the email beside a display-name label in the row and detail dialog", async () => {
    const slot = render([
      account({ label: "Person Example", email: "person@example.com" }),
      account({
        id: "22222222-2222-4222-8222-222222222222",
        label: "Claude API key",
        email: null,
      }),
    ]);
    expect(await slot.findByText("Person Example")).toBeTruthy();
    expect(slot.getAllByText("person@example.com")).toHaveLength(1);
    fireEvent.click(
      slot.getByRole("button", { name: "Open Person Example details" }),
    );
    expect(await slot.findByText("Email")).toBeTruthy();
    expect(slot.getAllByText("person@example.com")).toHaveLength(2);
  });

  function codexLoginStart() {
    return {
      sessionId: "33333333-3333-4333-8333-333333333333",
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234",
      expiresAt: Date.now() + 600_000,
      intervalMs: 60_000,
    };
  }

  function mockCompactViewport(matches: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 767px)" && matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  it("names the sign-in dialog once and keeps the step instructions", async () => {
    const slot = render([], { "codexLogin.start": codexLoginStart });
    fireEvent.click(
      await slot.findByRole("button", { name: "Sign in to Codex" }),
    );
    const dialog = await slot.findByRole("dialog", {
      name: "Sign in to Codex",
    });
    expect(
      slot.getAllByRole("heading", { name: "Sign in to Codex" }),
    ).toHaveLength(1);
    expect(dialog.textContent).toContain(
      "Open the verification page, sign in to ChatGPT, and enter this code.",
    );
    expect(
      (await slot.findByLabelText("Codex user code")).textContent,
    ).toContain("ABCD-1234");
    expect(slot.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it.each([false, true])(
    "cancels the pending sign-in from the header close with compact viewport %s",
    async (compact) => {
      mockCompactViewport(compact);
      const slot = render([], {
        "codexLogin.start": codexLoginStart,
        "codexLogin.poll": () => ({ status: "pending" }),
        "codexLogin.cancel": () => ({ cancelled: true }),
      });
      fireEvent.click(
        await slot.findByRole("button", { name: "Sign in to Codex" }),
      );
      await slot.findByRole("dialog", { name: "Sign in to Codex" });
      fireEvent.click(slot.getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(slot.rpcCalls).toContainEqual({
          method: "codexLogin.cancel",
          input: { sessionId: codexLoginStart().sessionId },
        }),
      );
      await waitFor(() =>
        expect(slot.queryByRole("dialog", { name: "Sign in to Codex" })).toBe(
          null,
        ),
      );
      const polls = () =>
        slot.rpcCalls.filter((call) => call.method === "codexLogin.poll")
          .length;
      const settled = polls();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(polls()).toBe(settled);
    },
  );

  it("does not claim success when copying the device code fails", async () => {
    const copy = deferred<boolean>();
    const slot = render(
      [],
      { "codexLogin.start": codexLoginStart },
      () => copy.promise,
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Sign in to Codex" }),
    );
    const button = await slot.findByRole("button", {
      name: "Copy Codex sign-in code",
    });
    fireEvent.click(button);
    expect(slot.inspection.experimental_clipboardWrites).toEqual([
      { text: "ABCD-1234" },
    ]);
    await act(async () => copy.resolve(false));
    expect(window.getSelection()?.toString()).toBe("ABCD-1234");
    expect(slot.queryByText("Sign-in code copied")).toBeNull();
    expect(button.querySelector('[data-icon="Check"]')).toBeNull();
  });

  it("does not claim success when copying the authorization URL fails", async () => {
    const copy = deferred<boolean>();
    const slot = render(
      [],
      { "codexLogin.start": codexLoginStart },
      () => copy.promise,
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Sign in to Codex" }),
    );
    const button = await slot.findByRole("button", {
      name: "Copy Codex authorization URL",
    });
    fireEvent.click(button);
    expect(slot.inspection.experimental_clipboardWrites).toEqual([
      { text: "https://auth.openai.com/codex/device" },
    ]);
    await act(async () => copy.resolve(false));
    const input = slot.getByRole("textbox", {
      name: "Codex authorization URL",
    }) as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(button.textContent).not.toContain("Copied");
    expect(slot.queryByText("Authorization URL copied")).toBeNull();
  });

  it("keeps polling and the close action working after copying the code", async () => {
    const copy = deferred<boolean>();
    const slot = render(
      [],
      {
        "codexLogin.start": codexLoginStart,
        "codexLogin.poll": () => ({ status: "pending" }),
        "codexLogin.cancel": () => ({ cancelled: true }),
      },
      () => copy.promise,
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Sign in to Codex" }),
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Copy Codex sign-in code" }),
    );
    expect(slot.inspection.experimental_clipboardWrites).toEqual([
      { text: "ABCD-1234" },
    ]);
    await act(async () => copy.resolve(true));
    expect(
      (await slot.findByRole("dialog", { name: "Sign in to Codex" }))
        .textContent,
    ).toContain("Waiting for you to authorize");
    fireEvent.click(slot.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual({
        method: "codexLogin.cancel",
        input: { sessionId: codexLoginStart().sessionId },
      }),
    );
  });

  it("offers a fresh Codex login after device-code polling fails", async () => {
    let starts = 0;
    const slot = render([], {
      "codexLogin.start": () => {
        starts += 1;
        return {
          sessionId: "33333333-3333-4333-8333-333333333333",
          verificationUri: "https://auth.openai.com/codex/device",
          userCode: "ABCD-1234",
          expiresAt: Date.now() + 600_000,
          intervalMs: 1,
        };
      },
      "codexLogin.poll": () => ({ status: "error", message: "Code expired." }),
    });
    fireEvent.click(
      await slot.findByRole("button", { name: "Sign in to Codex" }),
    );
    fireEvent.click(await slot.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(starts).toBe(2));
  });
  it.each(["claude", "codex"] as const)(
    "reorders %s accounts with the keyboard and persists the displayed order",
    async (provider) => {
      measureAccountRows();
      const first = account({ label: "First", provider });
      const second = account({
        id: "22222222-2222-4222-8222-222222222222",
        label: "Second",
        provider,
      });
      const other = account({
        id: "33333333-3333-4333-8333-333333333333",
        provider: provider === "claude" ? "codex" : "claude",
        label: "Other",
      });
      const accounts = [first, second, other];
      let finishSave = () => {};
      const slot = render(accounts, {
        "account.reorder": () =>
          new Promise<null>((resolve) => {
            finishSave = () => {
              accounts.splice(0, 2, second, first);
              resolve(null);
            };
          }),
      });
      const handle = await slot.findByRole("button", { name: "Reorder First" });
      await keyboardMove(handle);
      fireEvent.keyDown(document, { code: "Space" });
      await waitFor(() =>
        expect(slot.rpcCalls).toContainEqual({
          method: "account.reorder",
          input: { provider, accountIds: [second.id, first.id] },
        }),
      );
      const providerOrder = () =>
        slot
          .getAllByRole("button", { name: /Reorder (First|Second)/ })
          .map((button) => button.getAttribute("aria-label"));
      expect(providerOrder()).toEqual(["Reorder Second", "Reorder First"]);
      expect(handle.hasAttribute("disabled")).toBe(true);
      finishSave();
      await slot.experimental_invalidateRpc();
      await waitFor(() => expect(handle.hasAttribute("disabled")).toBe(false));
      expect(providerOrder()).toEqual(["Reorder Second", "Reorder First"]);
      expect(
        slot
          .getByRole("button", { name: "Reorder Other" })
          .hasAttribute("disabled"),
      ).toBe(true);
    },
  );

  it("restores the displayed order and reports a rejected reorder", async () => {
    measureAccountRows();
    const slot = render(
      [
        account({ label: "First" }),
        account({
          id: "22222222-2222-4222-8222-222222222222",
          label: "Second",
        }),
      ],
      {
        "account.reorder": () => {
          throw new Error("Refresh the account list and try again.");
        },
      },
    );
    const handle = await slot.findByRole("button", { name: "Reorder First" });
    await keyboardMove(handle);
    fireEvent.keyDown(document, { code: "Space" });
    expect(
      await slot.findByText("Refresh the account list and try again."),
    ).toBeTruthy();
    expect(
      slot
        .getAllByRole("button", { name: /Reorder/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Reorder First", "Reorder Second"]);
    expect(handle.hasAttribute("disabled")).toBe(false);
  });

  it.each(["cancel", "unchanged"])(
    "does not save a %s drag",
    async (action) => {
      measureAccountRows();
      const slot = render([
        account({ label: "First" }),
        account({
          id: "22222222-2222-4222-8222-222222222222",
          label: "Second",
        }),
      ]);
      const handle = await slot.findByRole("button", { name: "Reorder First" });
      await keyboardMove(handle, action === "cancel" ? "ArrowDown" : "ArrowUp");
      fireEvent.keyDown(document, {
        code: action === "cancel" ? "Escape" : "Space",
      });
      await waitFor(() =>
        expect(handle.getAttribute("aria-pressed")).toBeNull(),
      );
      expect(
        slot.rpcCalls.filter((call) => call.method === "account.reorder"),
      ).toEqual([]);
      expect(
        slot
          .getAllByRole("button", { name: /Reorder/ })
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Reorder First", "Reorder Second"]);
    },
  );
});

it.each([false, true])(
  "shows config failure with Retry and preserves drafts on refresh (loaded=%s)",
  async (loaded) => {
    let failed = !loaded;
    const slot = render([account()], {
      "config.get": () => {
        if (failed) throw new Error("Configuration unavailable");
        return config();
      },
    });
    let input: HTMLElement | null = null;
    if (loaded) {
      fireEvent.click(await slot.findByRole("button", { name: "Advanced" }));
      input = await slot.findByLabelText("Anthropic upstream base URL");
      fireEvent.change(input, {
        target: { value: "https://draft.example.com" },
      });
      failed = true;
      await slot.experimental_invalidateRpc(["config"]);
    }
    await slot.findByText("Configuration unavailable");
    if (input)
      expect((input as HTMLInputElement).value).toBe(
        "https://draft.example.com",
      );
    failed = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(slot.queryByText("Configuration unavailable")).toBeNull(),
    );
    if (input) {
      expect(slot.getByLabelText("Anthropic upstream base URL")).toBe(input);
      expect((input as HTMLInputElement).value).toBe(
        "https://draft.example.com",
      );
    }
  },
);

it("keeps the committed routing value while the status refresh is in flight", async () => {
  const nextStatus = deferred<PoolStatus>();
  let changed = false;
  const slot = render([account()], {
    "status.get": () => (changed ? nextStatus.promise : status()),
    "routing.set": () => {
      changed = true;
      return { provider: "claude", enabled: false };
    },
  });
  const toggle = await slot.findByRole("switch", {
    name: "Route Claude threads",
  });
  await slot.findByText("person@example.com");
  fireEvent.click(toggle);
  await slot.experimental_invalidateRpc(["config"]);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  await act(async () =>
    nextStatus.resolve({
      ...status(),
      routing: { claude: false, codex: true },
    }),
  );
  await waitFor(() =>
    expect(toggle.getAttribute("aria-checked")).toBe("false"),
  );
});

it("clears a config save error after an unchanged successful refresh without dropping the draft", async () => {
  const slot = render([account()], {
    "config.set": () => {
      throw new Error("Save refused");
    },
  });
  fireEvent.click(await slot.findByRole("button", { name: "Advanced" }));
  const input = await slot.findByLabelText("Anthropic upstream base URL");
  fireEvent.change(input, { target: { value: "https://draft.example.com" } });
  fireEvent.blur(input);
  await slot.findByText("Save refused");
  await slot.experimental_invalidateRpc(["config"]);
  await waitFor(() => expect(slot.queryByText("Save refused")).toBeNull());
  expect(slot.getByLabelText("Anthropic upstream base URL")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("https://draft.example.com");
});

it("clears a routing error after an unchanged successful read", async () => {
  const slot = render([account()], {
    "routing.set": () => {
      throw new Error("Routing unavailable");
    },
  });
  fireEvent.click(
    await slot.findByRole("switch", { name: "Route Claude threads" }),
  );
  await slot.findByText("Routing unavailable");
  await slot.experimental_invalidateRpc(["accounts"]);
  await waitFor(() =>
    expect(slot.queryByText("Routing unavailable")).toBeNull(),
  );
});

it.each([true, false])(
  "keeps account actions pending until the enable/disable status refresh arrives (enabled=%s)",
  async (enabled) => {
    const next = deferred<PoolStatus>();
    const initial = account({
      enabled,
      status: enabled ? "ready" : "disabled",
    });
    const updated = account({
      enabled: !enabled,
      status: enabled ? "disabled" : "ready",
    });
    const result = { account: accountSchema.strip().parse(updated) };
    let changed = false;
    const slot = render([initial], {
      "status.get": () => (changed ? next.promise : status([initial])),
      [enabled ? "account.disable" : "account.enable"]: () => {
        changed = true;
        return result;
      },
    });
    const menu = await slot.findByRole("button", {
      name: "person@example.com actions",
    });
    fireEvent.pointerDown(menu);
    fireEvent.click(
      await slot.findByRole("menuitem", {
        name: enabled ? "Disable" : "Enable",
      }),
    );
    await slot.experimental_invalidateRpc(["accounts"]);
    try {
      fireEvent.pointerDown(menu);
      const stale = await slot.findByRole("menuitem", {
        name: enabled ? "Disable" : "Enable",
      });
      expect(stale.getAttribute("aria-disabled")).toBe("true");
    } finally {
      await act(async () => next.resolve(status([updated])));
    }
    await waitFor(() =>
      expect(
        slot
          .getByRole("menuitem", { name: enabled ? "Enable" : "Disable" })
          .getAttribute("aria-disabled"),
      ).not.toBe("true"),
    );
  },
);

describe("settings action ordering through the server", () => {
  const disposals: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const dispose of disposals.splice(0).reverse()) await dispose();
  });

  async function fixture() {
    const dataDir = await mkdtemp(path.join(tmpdir(), "bb-pool-settings-"));
    const host = createFakePluginHost({
      pluginId: "account-pool",
      dataDir,
      sdk: { hosts: { list: async () => [] } },
    });
    disposals.push(async () => {
      await host.harness.lifecycle.dispose();
      await fs.rm(dataDir, { recursive: true, force: true });
    });
    await createAccountPoolPlugin({ env: {} })(host.bb);
    for (const label of ["First", "Second"]) {
      await host.harness.behavior.callRpc("account.add", {
        provider: "claude",
        source: { kind: "api-key", apiKey: "sk-test" },
        label,
        priority: label === "First" ? 1 : 2,
      });
    }
    const replies = new Map<string, () => Promise<void>>();
    const slot = renderSlot(
      app.settingsSections[0]!,
      {},
      {
        rpc: Object.fromEntries(
          Object.keys(accountPoolRpcContract).map((method) => [
            method,
            async (input: unknown) => {
              const result = await host.harness.behavior.callRpc(method, input);
              await replies.get(method)?.();
              return z.json().parse(result);
            },
          ]),
        ),
        experimental_rpcTags: (method) => ({
          tags: host.harness.inspection.rpcTags.get(method) ?? [],
        }),
      },
    );
    const unsubscribe = host.harness.inspection.experimental_onRpcInvalidation(
      (tags) => {
        void slot.experimental_invalidateRpc(tags ?? undefined);
      },
    );
    disposals.push(async () => {
      slot.unmount();
      unsubscribe();
    });
    await slot.findByRole("button", { name: "First actions" });
    await slot.findByRole("button", { name: "Advanced" });
    return { slot, host, replies };
  }

  it("keeps usage refresh pending through the status read", async () => {
    const { slot, replies } = await fixture();
    const read = deferred<void>();
    replies.set("status.get", () => read.promise);
    fireEvent.pointerDown(slot.getByRole("button", { name: "First actions" }));
    fireEvent.click(
      await slot.findByRole("menuitem", { name: "Refresh usage" }),
    );
    await waitFor(() =>
      expect(
        slot.rpcCalls.filter(({ method }) => method === "status.get").length,
      ).toBeGreaterThan(1),
    );
    try {
      expect(slot.queryByText("refreshing usage…")).not.toBeNull();
      fireEvent.pointerDown(
        slot.getByRole("button", { name: "First actions" }),
      );
      expect(
        (
          await slot.findByRole("menuitem", { name: "Refresh usage" })
        ).getAttribute("aria-disabled"),
      ).toBe("true");
    } finally {
      await act(async () => read.resolve());
    }
    await waitFor(() =>
      expect(slot.queryByText("refreshing usage…")).toBeNull(),
    );
  });

  it("does not admit another routing action before its status read settles", async () => {
    const { slot, replies } = await fixture();
    const read = deferred<void>();
    replies.set("status.get", () => read.promise);
    const toggle = slot.getByRole("switch", { name: "Route Claude threads" });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false"),
    );
    await waitFor(() =>
      expect(
        slot.rpcCalls.filter(({ method }) => method === "status.get").length,
      ).toBeGreaterThan(1),
    );
    try {
      fireEvent.click(toggle);
      await act(async () => {});
      expect(
        slot.rpcCalls.filter(({ method }) => method === "routing.set"),
      ).toHaveLength(1);
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    } finally {
      await act(async () => read.resolve());
    }
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("true"),
    );
  });

  it.each(["success", "failure"] as const)(
    "settles a reorder against authoritative status after a %s read",
    async (outcome) => {
      measureAccountRows();
      const { slot, host, replies } = await fixture();
      const read = deferred<void>();
      replies.set("status.get", () => read.promise);
      const handle = slot.getByRole("button", { name: "Reorder First" });
      await keyboardMove(handle);
      fireEvent.keyDown(document, { code: "Space" });
      await waitFor(() =>
        expect(
          slot.rpcCalls.some(({ method }) => method === "account.reorder"),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(
          slot.rpcCalls.filter(({ method }) => method === "status.get").length,
        ).toBeGreaterThan(1),
      );
      try {
        expect(handle.hasAttribute("disabled")).toBe(true);
      } finally {
        if (outcome === "failure")
          await act(async () => read.reject(new Error("Status unavailable")));
        else await act(async () => read.resolve());
      }
      replies.delete("status.get");
      if (outcome === "failure") await slot.findByText("Status unavailable");
      await waitFor(() => expect(handle.hasAttribute("disabled")).toBe(false));
      const current = statusSchema.parse(
        await host.harness.behavior.callRpc("status.get", null),
      );
      await act(async () => {
        await host.harness.behavior.callRpc("account.reorder", {
          provider: "claude",
          accountIds: [...current.accounts].reverse().map(({ id }) => id),
        });
      });
      await waitFor(() =>
        expect(
          slot
            .getAllByRole("button", { name: /Reorder/ })
            .map((button) => button.getAttribute("aria-label")),
        ).toEqual(["Reorder First", "Reorder Second"]),
      );
    },
  );

  it("releases a failed reorder's optimistic order before a later status update", async () => {
    measureAccountRows();
    const { slot, host, replies } = await fixture();
    replies.set("status.get", async () => {
      throw new Error("Status unavailable");
    });
    const handle = slot.getByRole("button", { name: "Reorder First" });
    await keyboardMove(handle);
    fireEvent.keyDown(document, { code: "Space" });
    await slot.findByText("Status unavailable");
    await waitFor(() => expect(handle.hasAttribute("disabled")).toBe(false));
    expect(
      slot
        .getAllByRole("button", { name: /Reorder/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Reorder First", "Reorder Second"]);
    replies.delete("status.get");
    await act(async () => {
      await slot.experimental_invalidateRpc(["accounts"]);
    });
    await waitFor(() =>
      expect(
        slot
          .getAllByRole("button", { name: /Reorder/ })
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Reorder Second", "Reorder First"]),
    );
    expect(
      statusSchema
        .parse(await host.harness.behavior.callRpc("status.get", null))
        .accounts.map(({ label }) => label),
    ).toEqual(["Second", "First"]);
  });
  it("reconciles routing after a failed read when the next status equals the cached pre-action value", async () => {
    const { slot, host, replies } = await fixture();
    replies.set("status.get", async () => {
      throw new Error("Status unavailable");
    });
    const toggle = slot.getByRole("switch", { name: "Route Claude threads" });
    fireEvent.click(toggle);
    await slot.findByText("Status unavailable");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    replies.delete("status.get");
    await act(async () => {
      await host.harness.behavior.callRpc("routing.set", {
        provider: "claude",
        enabled: true,
      });
    });
    await waitFor(() =>
      expect(slot.queryByText("Status unavailable")).toBeNull(),
    );
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("preserves the next draft when a delayed config read repeats the completed save", async () => {
    const { slot, replies } = await fixture();
    fireEvent.click(slot.getByRole("button", { name: "Advanced" }));
    const input = await slot.findByLabelText("Anthropic upstream base URL");
    if (!(input instanceof HTMLInputElement))
      throw new Error("Expected a config input.");
    await waitFor(() => expect(input.disabled).toBe(false));
    const read = deferred<void>();
    replies.set("config.get", () => read.promise);
    fireEvent.change(input, { target: { value: "https://saved.example.com" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(slot.rpcCalls.some(({ method }) => method === "config.set")).toBe(
        true,
      ),
    );
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, {
      target: { value: "https://next-draft.example.com" },
    });
    await act(async () => read.resolve());
    expect(input.value).toBe("https://next-draft.example.com");
  });

  it("applies a config revert even when it equals the cached value from before the save", async () => {
    const { slot, host, replies } = await fixture();
    fireEvent.click(slot.getByRole("button", { name: "Advanced" }));
    const input = await slot.findByLabelText("Anthropic upstream base URL");
    if (!(input instanceof HTMLInputElement))
      throw new Error("Expected a config input.");
    await waitFor(() => expect(input.disabled).toBe(false));
    const original = input.value;
    const read = deferred<void>();
    replies.set("config.get", () => read.promise);
    fireEvent.change(input, { target: { value: "https://saved.example.com" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(slot.rpcCalls.some(({ method }) => method === "config.set")).toBe(
        true,
      ),
    );
    await waitFor(() => expect(input.disabled).toBe(false));
    await act(async () => read.reject(new Error("Config unavailable")));
    await slot.findByText("Config unavailable");
    replies.delete("config.get");
    await act(async () => {
      await host.harness.behavior.callRpc("config.set", {
        anthropicUpstreamBaseUrl: original,
      });
    });
    await waitFor(() =>
      expect(slot.queryByText("Config unavailable")).toBeNull(),
    );
    expect(input.value).toBe(original);
  });
});
