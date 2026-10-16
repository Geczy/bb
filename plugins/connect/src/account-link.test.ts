import { afterEach, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { AccountLink } from "./account-link.js";
import { createAccountClient, type Account } from "./account-client.js";
import {
  CredentialCopy,
  createCredentialCopyStore,
} from "./credential-copy.js";
import { FakeAccount } from "./testing/fake-account.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  const fake = new FakeAccount();
  const host = createFakePluginHost({
    pluginId: "connect",
    sdk: {
      plugins: {
        callRpc: (...args: Parameters<typeof fake.callRpc>) =>
          fake.callRpc(...args),
        experimental_watchRpc: fake.watchRpc,
      },
    },
  });
  const account = createAccountClient(() => host.bb.sdk);
  const store = createCredentialCopyStore(host.bb.storage.kv);
  const copy = new CredentialCopy({ account, store, log: host.bb.log });
  const updates: Array<Account | null> = [];
  const controller = new AbortController();
  const link = new AccountLink({
    account,
    copy,
    log: host.bb.log,
    onAccount: (value) => updates.push(value),
    retryMinMs: 20,
  });
  let running: Promise<void> | undefined;
  return {
    fake,
    account,
    store,
    updates,
    start: () => {
      running = link.run(controller.signal);
    },
    async stop() {
      controller.abort();
      await running;
      await host.harness.dispose();
    },
  };
}

it("clears the published account when credential synchronization finds bb-account unavailable", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const first = f.fake.signIn();
  f.fake.serverCredential = "server-credential";
  try {
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.updates).toEqual([first]);
    const rpc = f.fake.callRpc;
    const call = vi
      .spyOn(f.fake, "callRpc")
      .mockImplementation(async (args) => {
        if (args.method === "bb-account.v1.connectCredential") {
          call.mockImplementation(rpc);
          throw Object.assign(new Error("HTTP 503: not running"), {
            status: 503,
          });
        }
        return rpc(args);
      });
    f.fake.signIn({ name: "Updated profile" });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.updates).toEqual([first, null]);
    await vi.advanceTimersByTimeAsync(20);
    expect(f.updates.at(-1)).toEqual(f.fake.status.account);
  } finally {
    await f.stop();
  }
});

it("reads fresh status before retrying a failed sync when newer status reads fail", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.fake.signIn();
  f.fake.serverCredential = "first-credential";
  vi.spyOn(f.store, "write").mockRejectedValueOnce(new Error("disk busy"));
  try {
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    const rpc = f.fake.callRpc;
    const call = vi.spyOn(f.fake, "callRpc").mockImplementation((args) => {
      if (args.method === "bb-account.v1.status")
        return Promise.reject(new Error("status temporarily unreadable"));
      return rpc(args);
    });
    f.fake.serverCredential = "second-credential";
    f.fake.signIn({ serverUrl: "https://second.getbb.app", serverId: "srv_2" });
    await vi.advanceTimersByTimeAsync(20);
    expect(f.updates).toEqual([]);
    call.mockRestore();
    f.fake.available = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(f.updates.at(-1)).toEqual(f.fake.status.account);
    expect(await f.store.read()).toMatchObject({
      serverUrl: "https://second.getbb.app",
      credential: "second-credential",
    });
  } finally {
    await f.stop();
  }
});

it("discards queued sign-outs after availability is lost instead of clearing the saved credential", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.fake.signIn();
  f.fake.serverCredential = "server-credential";
  const write = f.store.write;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(f.store, "write").mockImplementation(async (value) => {
    await blocked;
    await write(value);
  });
  try {
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    f.fake.signOut();
    await vi.advanceTimersByTimeAsync(0);
    f.fake.available = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.updates).toEqual([null]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await f.store.read()).toMatchObject({
      credential: "server-credential",
    });
    expect(f.updates).toEqual([null]);
    f.fake.available = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(await f.store.read()).toBeNull();
  } finally {
    release();
    await f.stop();
  }
});

it("keeps synchronization backoff even when invalidations return the same revision", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.store.write({
    serverUrl: "https://sawyer.getbb.app",
    handle: "sawyer",
    credential: "legacy",
  });
  await f.store.writeMarker("0".repeat(64));
  f.fake.adopt = () => {
    throw new Error("getbb.app unreachable");
  };
  try {
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.fake.adoptions).toHaveLength(1);
    f.fake.available = true;
    await vi.advanceTimersByTimeAsync(19);
    expect(f.fake.adoptions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.fake.adoptions).toHaveLength(2);
    f.fake.available = true;
    await vi.advanceTimersByTimeAsync(39);
    expect(f.fake.adoptions).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.fake.adoptions).toHaveLength(3);
  } finally {
    await f.stop();
  }
});

it("does not sync an unchanged revision again until an error resets synchronization", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.fake.signIn();
  f.fake.serverCredential = "server-credential";
  const read = vi.spyOn(f.store, "read");
  try {
    f.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledOnce();
    f.fake.available = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledOnce();
    f.fake.available = false;
    await vi.advanceTimersByTimeAsync(0);
    f.fake.available = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2);
    expect(f.updates.at(-1)).toEqual(f.fake.status.account);
  } finally {
    await f.stop();
  }
});

it.each(["resolve", "reject"])(
  "drains a pending sync on abort without publishing or retrying when it later %ss",
  async (completion) => {
    vi.useFakeTimers();
    const f = fixture();
    f.fake.signIn();
    f.fake.serverCredential = "server-credential";
    let release!: () => void;
    let reject!: (error: Error) => void;
    const blocked = new Promise<void>((resolve, fail) => {
      release = resolve;
      reject = fail;
    });
    const write = vi.spyOn(f.store, "write").mockReturnValue(blocked);
    try {
      f.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(write).toHaveBeenCalledOnce();
      f.fake.signOut();
      await vi.advanceTimersByTimeAsync(0);
      const stopping = f.stop();
      if (completion === "resolve") release();
      else reject(new Error("disk failure during shutdown"));
      await stopping;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.updates).toEqual([]);
      expect(write).toHaveBeenCalledOnce();
    } finally {
      release();
      await f.stop();
    }
  },
);

it("keeps an unavailable account cleared when an earlier credential sync completes, then recovers", async () => {
  const fake = new FakeAccount();
  fake.signIn();
  fake.serverCredential = "server-credential";
  const host = createFakePluginHost({
    pluginId: "connect",
    sdk: {
      plugins: { callRpc: fake.callRpc, experimental_watchRpc: fake.watchRpc },
    },
  });
  const account = createAccountClient(() => host.bb.sdk);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = vi.fn(() => blocked);
  const copy = new CredentialCopy({
    account,
    log: host.bb.log,
    store: {
      read: async () => null,
      readMarker: async () => null,
      write,
      writeMarker: async () => {},
      clear: async () => {},
    },
  });
  const sync = vi.spyOn(copy, "sync");
  const updates: Array<Account | null> = [];
  const controller = new AbortController();
  const running = new AccountLink({
    account,
    copy,
    log: host.bb.log,
    onAccount: (value) => updates.push(value),
  }).run(controller.signal);
  try {
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    fake.available = false;
    await vi.waitFor(() => expect(updates).toEqual([null]));
    release();
    await sync.mock.results[0]!.value;
    expect(updates).toEqual([null]);
    fake.available = true;
    await vi.waitFor(() => expect(updates.at(-1)).toEqual(fake.status.account));
  } finally {
    release();
    controller.abort();
    await running;
    await host.harness.dispose();
  }
});
